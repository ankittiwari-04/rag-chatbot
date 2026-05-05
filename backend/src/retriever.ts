import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from './config';

export interface RetrievedChunk {
  content: string;
  source: string;
  score: number;
  chunkIndex: number;
}

// ─── Qdrant client singleton ──────────────────────────────────────────────────

let qdrantClient: QdrantClient | null = null;

function getClient(): QdrantClient {
  if (!qdrantClient) {
    qdrantClient = new QdrantClient({
      url: config.QDRANT_URL,
      apiKey: config.QDRANT_API_KEY,
    });
  }
  return qdrantClient;
}

// ─── Ensure collection exists ─────────────────────────────────────────────────

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

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Retrieve top-K similar chunks for a query.
 * Returns empty array if collection is empty or unavailable.
 */
export async function retrieve(query: string, topK = 4): Promise<RetrievedChunk[]> {
  try {
    const embedder = new GoogleGenerativeAIEmbeddings({
      apiKey: config.GEMINI_API_KEY,
      model: 'text-embedding-004',
    });

    const [queryEmbedding] = await embedder.embedDocuments([query]);

    const client = getClient();
    await ensureCollection(client);

    const collectionInfo = await client.getCollection(config.QDRANT_COLLECTION);
    const count = collectionInfo.points_count ?? 0;
    if (count === 0) return [];

    const results = await client.search(config.QDRANT_COLLECTION, {
      vector: queryEmbedding,
      limit: Math.min(topK, count),
      with_payload: true,
    });

    return results.map((hit) => ({
      content: (hit.payload?.['content'] as string | undefined) ?? '',
      source: (hit.payload?.['source'] as string | undefined) ?? 'unknown',
      score: hit.score,
      chunkIndex: (hit.payload?.['chunk_index'] as number | undefined) ?? 0,
    }));
  } catch (err) {
    console.error('Retrieval error:', err);
    return [];
  }
}

/**
 * Reset the client singleton (call after ingesting new documents).
 */
export function resetVectorStore(): void {
  qdrantClient = null;
}

/**
 * Delete all documents from the collection.
 */
export async function clearCollection(): Promise<void> {
  try {
    const client = getClient();
    await client.deleteCollection(config.QDRANT_COLLECTION);
    // Recreate empty collection
    await client.createCollection(config.QDRANT_COLLECTION, {
      vectors: { size: 768, distance: 'Cosine' },
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
    await ensureCollection(client);
    const info = await client.getCollection(config.QDRANT_COLLECTION);
    return { count: info.points_count ?? 0, name: config.QDRANT_COLLECTION };
  } catch {
    return { count: 0, name: config.QDRANT_COLLECTION };
  }
}
