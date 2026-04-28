import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { askQuestion } from '../chain';
import { historyManager } from '../history';

const router = Router();

// ─── Validation schemas ───────────────────────────────────────────────────────

const chatBodySchema = z.object({
  question: z
    .string({ required_error: 'question is required' })
    .min(2, 'question must be at least 2 characters')
    .max(500, 'question must be at most 500 characters')
    .trim(),
  sessionId: z.string().uuid().optional(),
});

// ─── Routes ───────────────────────────────────────────────────────────────────

// POST /chat
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = chatBodySchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
    });
    return;
  }

  const { question, sessionId: incomingSessionId } = parsed.data;
  const sessionId = incomingSessionId ?? uuidv4();

  try {
    const response = await askQuestion(question, sessionId);
    res.json({ success: true, data: response });
  } catch (err) {
    next(err);
  }
});

// GET /chat/history/:sessionId
router.get('/history/:sessionId', (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const messages = historyManager.getHistory(sessionId);
  res.json({ success: true, data: { sessionId, messages } });
});

// DELETE /chat/history/:sessionId
router.delete('/history/:sessionId', (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const cleared = historyManager.clearHistory(sessionId);
  res.json({
    success: true,
    data: {
      message: cleared
        ? 'Session history cleared.'
        : 'Session not found (no action taken).',
      cleared,
    },
  });
});

export default router;
