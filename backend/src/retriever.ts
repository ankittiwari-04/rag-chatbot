import { OllamaEmbeddings } from '@langchain/ollama';
import { ChromaClient } from 'chromadb';
import { config } from './config';

export interface RetrievedChunk {
  content: string;
  source: string;
  score: number;
  chunkIndex: number;
}

// ─── Native ChromaDB client (supports v2 tenant API) ─────────────────────────

let chromaClient: ChromaClient | null = null;

function getClient(): ChromaClient {
  if (!chromaClient) {
    chromaClient = new ChromaClient({ path: config.CHROMA_URL });
  }
  return chromaClient;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Retrieve top-K similar chunks for a query.
 * Returns empty array if collection is empty or unavailable.
 */
export async function retrieve(query: string, topK = 4): Promise<RetrievedChunk[]> {
  try {
    const embedder = new OllamaEmbeddings({
      baseUrl: config.OLLAMA_BASE_URL,
      model: config.EMBED_MODEL,
    });

    const [queryEmbedding] = await embedder.embedDocuments([query]);

    const client = getClient();
    const collection = await client.getOrCreateCollection({
      name: config.COLLECTION_NAME,
      metadata: { 'hnsw:space': 'cosine' },
    });

    const count = await collection.count();
    if (count === 0) return [];

    const results = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: Math.min(topK, count),
      include: ['documents', 'metadatas', 'distances'] as never,
    });

    const docs = results.documents[0] ?? [];
    const metas = results.metadatas[0] ?? [];
    const distances = results.distances?.[0] ?? [];

    return docs.map((doc, i) => ({
      content: doc ?? '',
      source: (metas[i]?.['source'] as string | undefined) ?? 'unknown',
      // ChromaDB cosine distance: 0=identical, 2=opposite → convert to similarity score
      score: 1 - (distances[i] ?? 1),
      chunkIndex: (metas[i]?.['chunkIndex'] as number | undefined) ?? 0,
    }));
  } catch {
    return [];
  }
}

/**
 * Reset the client singleton (call after ingesting new documents).
 */
export function resetVectorStore(): void {
  chromaClient = null;
}

/**
 * Delete all documents from the collection.
 */
export async function clearCollection(): Promise<void> {
  try {
    const client = getClient();
    await client.deleteCollection({ name: config.COLLECTION_NAME });
    // Recreate empty collection
    await client.createCollection({
      name: config.COLLECTION_NAME,
      metadata: { 'hnsw:space': 'cosine' },
    });
  } catch {
    // Collection may not exist — that's fine
  }
  resetVectorStore();
}

/**
 * Get metadata about the current collection.
 */
export async function getCollectionInfo(): Promise<{ count: number; name: string }> {
  try {
    const client = getClient();
    const collection = await client.getOrCreateCollection({
      name: config.COLLECTION_NAME,
      metadata: { 'hnsw:space': 'cosine' },
    });
    const count = await collection.count();
    return { count, name: config.COLLECTION_NAME };
  } catch {
    return { count: 0, name: config.COLLECTION_NAME };
  }
}
