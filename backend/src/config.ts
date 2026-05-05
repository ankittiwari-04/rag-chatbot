import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const configSchema = z.object({
  // Google Gemini — used for both LLM (gemini-1.5-flash) and embeddings (text-embedding-004)
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required'),

  // Qdrant Cloud — vector database
  QDRANT_URL: z.string().url('QDRANT_URL must be a valid URL'),
  QDRANT_API_KEY: z.string().min(1, 'QDRANT_API_KEY is required'),
  QDRANT_COLLECTION: z.string().min(1).default('rag-knowledge-base'),

  // Server
  PORT: z.coerce.number().int().positive().default(3001),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  MAX_FILE_SIZE_MB: z.coerce.number().positive().default(10),
});

const parsed = configSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  parsed.error.errors.forEach((err) => {
    console.error(`  - ${err.path.join('.')}: ${err.message}`);
  });
  process.exit(1);
}

export const config = parsed.data;

export type Config = typeof config;
