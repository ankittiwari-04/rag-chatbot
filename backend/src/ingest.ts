import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { OllamaEmbeddings } from '@langchain/ollama';
import { Document } from '@langchain/core/documents';
import { ChromaClient } from 'chromadb';
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
      // Only keep ChromaDB-safe metadata: string, number, boolean, or null
      chunk.metadata = {
        source: String(fileName),
        chunk_index: idx,                          // number ✅
        ingested_at: new Date().toISOString(),     // string ✅
      };
    });

    allDocs.push(...chunks);
  }

  if (allDocs.length === 0) {
    console.log('No chunks created — files may be empty.');
    return { filesProcessed: filePaths.length, chunksCreated: 0, elapsedMs: Date.now() - start };
  }

  // Generate embeddings via Ollama
  const embedder = new OllamaEmbeddings({
    baseUrl: config.OLLAMA_BASE_URL,
    model: config.EMBED_MODEL,
  });

  console.log(`Embedding ${allDocs.length} chunks with ${config.EMBED_MODEL}...`);
  const texts = allDocs.map((d) => d.pageContent);
  const embeddings = await embedder.embedDocuments(texts);

  // Upsert into ChromaDB using native client (v2 compatible)
  const client = new ChromaClient({ path: config.CHROMA_URL });

  const collection = await client.getOrCreateCollection({
    name: config.COLLECTION_NAME,
    metadata: { 'hnsw:space': 'cosine' },
  });

  const ids = allDocs.map((_, i) => `doc-${Date.now()}-${i}`);

  // Sanitize all metadata values to be ChromaDB-safe
  const metadatas = allDocs.map((d) => {
    const safe: Record<string, string | number | boolean> = {};
    for (const [key, val] of Object.entries(d.metadata)) {
      if (
        typeof val === 'string' ||
        typeof val === 'number' ||
        typeof val === 'boolean'
      ) {
        safe[key] = val;
      } else if (val !== null && val !== undefined) {
        safe[key] = String(val); // convert anything else to string
      }
    }
    return safe;
  });

  await collection.upsert({ ids, embeddings, documents: texts, metadatas });

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