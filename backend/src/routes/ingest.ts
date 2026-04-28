import { Router, Request, Response, NextFunction } from 'express';
import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { ingestFiles } from '../ingest';
import { clearCollection, getCollectionInfo, resetVectorStore } from '../retriever';
import { config } from '../config';

const router = Router();

// ─── Multer configuration ─────────────────────────────────────────────────────

const MAX_FILE_SIZE = config.MAX_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.pdf', '.txt', '.md'];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const tmpDir = path.join(os.tmpdir(), 'rag-uploads');
    fs.mkdirSync(tmpDir, { recursive: true });
    cb(null, tmpDir);
  },
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback,
) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_EXTENSIONS.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${ext}. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 5,
  },
});

// ─── Routes ───────────────────────────────────────────────────────────────────

// POST /ingest/upload
router.post(
  '/upload',
  upload.array('files', 5),
  async (req: Request, res: Response, next: NextFunction) => {
    const files = req.files as Express.Multer.File[] | undefined;

    if (!files || files.length === 0) {
      res.status(400).json({ success: false, error: 'No files uploaded.' });
      return;
    }

    const filePaths = files.map((f) => f.path);

    try {
      const stats = await ingestFiles(filePaths);

      // Reset the retriever singleton so it picks up new documents
      resetVectorStore();

      res.json({
        success: true,
        data: {
          message: `Successfully ingested ${stats.filesProcessed} file(s) into ${stats.chunksCreated} chunks.`,
          stats,
        },
      });
    } catch (err) {
      next(err);
    } finally {
      // Clean up temp files regardless of outcome
      for (const filePath of filePaths) {
        try {
          fs.unlinkSync(filePath);
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  },
);

// POST /ingest/clear
router.post('/clear', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    await clearCollection();
    res.json({
      success: true,
      data: {
        message: 'Knowledge base cleared successfully.',
        success: true,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /ingest/status
router.get('/status', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const info = await getCollectionInfo();
    res.json({
      success: true,
      data: info,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
