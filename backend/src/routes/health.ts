import { Router, Request, Response } from 'express';
import { config } from '../config';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      uptime: process.uptime(),
      services: {
        llm: 'Google Gemini 1.5 Flash',
        embeddings: 'Google text-embedding-004',
        vectorDb: 'Qdrant Cloud',
      },
      collection: config.QDRANT_COLLECTION,
      timestamp: new Date().toISOString(),
    },
  });
});

export default router;
