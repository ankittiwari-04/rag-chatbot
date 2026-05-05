import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import pino from 'pino';
import { config } from './config';
import { historyManager } from './history';
import healthRouter from './routes/health';
import chatRouter from './routes/chat';
import ingestRouter from './routes/ingest';

// ─── Logger ───────────────────────────────────────────────────────────────────

const logger = pino({
  level: process.env['NODE_ENV'] === 'production' ? 'info' : 'debug',
  transport:
    process.env['NODE_ENV'] !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});

// ─── App setup ────────────────────────────────────────────────────────────────

const app = express();

// HTTP request logging
app.use(pinoHttp({ logger }));

// CORS — only allow the configured frontend origin
app.use(
  cors({
    origin: config.FRONTEND_URL,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }),
);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use('/api/health', healthRouter);
app.use('/api/chat', chatRouter);
app.use('/api/ingest', ingestRouter);

// ─── 404 handler ─────────────────────────────────────────────────────────────

app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, error: 'Route not found.' });
});

// ─── Global error handler ─────────────────────────────────────────────────────

interface ApiError extends Error {
  statusCode?: number;
  details?: string;
}

// Express requires 4-arg signature for error handlers
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: ApiError, _req: Request, res: Response, _next: NextFunction) => {
  const statusCode = err.statusCode ?? 500;
  const message = err.message ?? 'Internal server error';

  logger.error({ err, statusCode }, message);

  // Multer errors
  if (err.name === 'MulterError') {
    res.status(400).json({ success: false, error: `File upload error: ${message}` });
    return;
  }

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(err.details ? { details: err.details } : {}),
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

const server = app.listen(config.PORT, () => {
  logger.info(`🚀 RAG Chatbot backend running on port ${config.PORT}`);
  logger.info(`   CORS origin: ${config.FRONTEND_URL}`);
  logger.info(`   LLM: Google Gemini 1.5 Flash`);
  logger.info(`   Embeddings: Google text-embedding-004`);
  logger.info(`   Vector DB: Qdrant @ ${config.QDRANT_URL} (collection: ${config.QDRANT_COLLECTION})`);
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────

function gracefulShutdown(signal: string): void {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    logger.info('HTTP server closed.');
    historyManager.destroy();
    process.exit(0);
  });

  // Force kill after 10 s
  setTimeout(() => {
    logger.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;
