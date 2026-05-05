import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { Document } from '@langchain/core/documents';
import { QdrantClient } from '@qdrant/js-client-rest';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
// pdf-parse does not export types cleanly; using require for compatibility
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<{ text: string }>;
import { config } from './config';

export interface IngestStats {
  filesProcessed: number;
  chunksCreated: number;
  elapsedMs: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function extractText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') {
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return data.text;
  }
  if (ext === '.txt' || ext === '.md') {
    return fs.readFileSync(filePath, 'utf-8');
  }
  throw new Error(`Unsupported file type: ${ext}`);
}

// ─── Ensure Qdrant collection exists ─────────────────────────────────────────

async function ensureCollection(client: QdrantClient): Promise<void> {
  try {
    await client.getCollection(config.QDRANT_COLLECTION);
  } catch {
    // Collection doesn't exist — create it (768 dims for text-embedding-004)
    await client.createCollection(config.QDRANT_COLLECTION, {
      vectors: { size: 768, distance: 'Cosine' },
    });
  }
}

// ─── Core ingestion pipeline ──────────────────────────────────────────────────

export async function ingestFiles(filePaths: string[]): Promise<IngestStats> {
  const start = Date.now();
  if (filePaths.length === 0) return { filesProcessed: 0, chunksCreated: 0, elapsedMs: 0 };

  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 600, chunkOverlap: 80 });
  const allDocs: Document[] = [];

  for (const filePath of filePaths) {
    const text = await extractText(filePath);
    const fileName = path.basename(filePath);
    const chunks = await splitter.createDocuments([text], [{ source: fileName }]);

    chunks.forEach((chunk, idx) => {
      chunk.metadata = {
        source: String(fileName),
        chunk_index: idx,
        ingested_at: new Date().toISOString(),
      };
    });

    allDocs.push(...chunks);
  }

  if (allDocs.length === 0) {
    console.log('No chunks created — files may be empty.');
    return { filesProcessed: filePaths.length, chunksCreated: 0, elapsedMs: Date.now() - start };
  }

  // Generate embeddings via Google Gemini text-embedding-004
  const embedder = new GoogleGenerativeAIEmbeddings({
    apiKey: config.GEMINI_API_KEY,
    model: 'text-embedding-004',
  });

  console.log(`Embedding ${allDocs.length} chunks with text-embedding-004...`);
  const texts = allDocs.map((d) => d.pageContent);
  const embeddings = await embedder.embedDocuments(texts);

  // Upsert into Qdrant Cloud
  const client = new QdrantClient({
    url: config.QDRANT_URL,
    apiKey: config.QDRANT_API_KEY,
  });

  await ensureCollection(client);

  // Qdrant points must have UUID or uint64 IDs
  const points = allDocs.map((doc, i) => ({
    id: uuidv4(),
    vector: embeddings[i],
    payload: {
      content: doc.pageContent,
      source: String(doc.metadata['source'] ?? 'unknown'),
      chunk_index: Number(doc.metadata['chunk_index'] ?? i),
      ingested_at: String(doc.metadata['ingested_at'] ?? new Date().toISOString()),
    },
  }));

  // Upsert in batches of 100 to avoid request size limits
  const BATCH_SIZE = 100;
  for (let i = 0; i < points.length; i += BATCH_SIZE) {
    const batch = points.slice(i, i + BATCH_SIZE);
    await client.upsert(config.QDRANT_COLLECTION, { wait: true, points: batch });
  }

  return {
    filesProcessed: filePaths.length,
    chunksCreated: allDocs.length,
    elapsedMs: Date.now() - start,
  };
}

// ─── CLI runner ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const docsDir = path.join(process.cwd(), 'docs');
  if (!fs.existsSync(docsDir)) {
    console.error(`docs/ not found at ${docsDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(docsDir)
    .filter((f) => ['.txt', '.md', '.pdf'].includes(path.extname(f).toLowerCase()))
    .map((f) => path.join(docsDir, f));

  if (files.length === 0) {
    console.log('No supported files found in docs/');
    process.exit(0);
  }

  console.log(`Ingesting ${files.length} file(s)...`);
  const stats = await ingestFiles(files);
  console.log(`✅ Done: ${JSON.stringify(stats)}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Ingestion failed:', err);
    process.exit(1);
  });
}
