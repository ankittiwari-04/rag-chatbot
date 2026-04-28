import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const configSchema = z.object({
  OLLAMA_BASE_URL: z.string().url().default('http://localhost:11434'),
  LLM_MODEL: z.string().min(1).default('llama3'),
  EMBED_MODEL: z.string().min(1).default('nomic-embed-text'),
  CHROMA_URL: z.string().url().default('http://localhost:8000'),
  COLLECTION_NAME: z.string().min(1).default('rag-knowledge-base'),
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
