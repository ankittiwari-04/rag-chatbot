import { Router, Request, Response } from 'express';
import { config } from '../config';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      uptime: process.uptime(),
      models: {
        llm: config.LLM_MODEL,
        embeddings: config.EMBED_MODEL,
      },
      collection: config.COLLECTION_NAME,
      timestamp: new Date().toISOString(),
    },
  });
});

export default router;
