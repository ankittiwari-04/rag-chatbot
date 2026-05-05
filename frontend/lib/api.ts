import axios, { AxiosError } from 'axios';
import type {
  ChatResponse,
  UploadResponse,
  Message,
  HealthResponse,
  ApiSuccess,
} from '@/types';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
const DEMO_DOCS_KEY = 'rag_demo_documents';
const DEMO_HISTORY_PREFIX = 'rag_demo_history_';
const BACKEND_PROBE_TTL_MS = 30_000;

let backendProbe: { ok: boolean; checkedAt: number } | null = null;

const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 120_000,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ success: false; error: string; details?: string }>) => {
    const status = error.response?.status;
    const message =
      error.response?.data?.error ??
      error.response?.data?.details ??
      (status ? `${status} ${error.response?.statusText}` : undefined) ??
      error.message ??
      'An unexpected error occurred.';

    return Promise.reject(new Error(message));
  },
);

interface DemoDocument {
  id: string;
  name: string;
  content: string;
  uploadedAt: string;
}

function hasStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function shouldFallback(error: unknown): boolean {
  if (!hasStorage()) return false;
  if (!(error instanceof Error)) return true;

  const message = error.message.toLowerCase();
  return (
    message.includes('network') ||
    message.includes('404') ||
    message.includes('timeout') ||
    message.includes('failed') ||
    message.includes('not found')
  );
}

async function isBackendAvailable(): Promise<boolean> {
  const now = Date.now();
  if (backendProbe && now - backendProbe.checkedAt < BACKEND_PROBE_TTL_MS) {
    return backendProbe.ok;
  }

  try {
    await apiClient.get('/health', { timeout: 2_500 });
    backendProbe = { ok: true, checkedAt: now };
    return true;
  } catch {
    backendProbe = { ok: false, checkedAt: now };
    return false;
  }
}

function readDocs(): DemoDocument[] {
  if (!hasStorage()) return [];
  try {
    return JSON.parse(localStorage.getItem(DEMO_DOCS_KEY) ?? '[]') as DemoDocument[];
  } catch {
    return [];
  }
}

function writeDocs(docs: DemoDocument[]): void {
  if (hasStorage()) localStorage.setItem(DEMO_DOCS_KEY, JSON.stringify(docs));
}

function readDemoHistory(sessionId: string): Message[] {
  if (!hasStorage()) return [];
  try {
    const messages = JSON.parse(
      localStorage.getItem(`${DEMO_HISTORY_PREFIX}${sessionId}`) ?? '[]',
    ) as Message[];

    return messages.map((message) => ({
      ...message,
      timestamp: new Date(message.timestamp),
    }));
  } catch {
    return [];
  }
}

function writeDemoHistory(sessionId: string, messages: Message[]): void {
  if (hasStorage()) {
    localStorage.setItem(`${DEMO_HISTORY_PREFIX}${sessionId}`, JSON.stringify(messages));
  }
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

function chunkText(content: string, size = 900): string[] {
  const clean = content.replace(/\s+/g, ' ').trim();
  if (!clean) return [];

  const chunks: string[] = [];
  for (let i = 0; i < clean.length; i += size) {
    chunks.push(clean.slice(i, i + size));
  }
  return chunks;
}

function randomId(): string {
  return crypto.randomUUID();
}

function createDemoAnswer(question: string, sessionId: string): ChatResponse {
  const start = Date.now();
  const docs = readDocs();
  const queryWords = new Set(tokenize(question));

  if (docs.length === 0) {
    return {
      answer:
        'No documents are available yet. Upload a TXT or Markdown file, then ask a question about it. The hosted backend will be used automatically when it is online.',
      sources: [],
      latencyMs: Date.now() - start,
      sessionId,
    };
  }

  const ranked = docs
    .flatMap((doc) =>
      chunkText(doc.content).map((chunk) => {
        const chunkWords = tokenize(chunk);
        const matches = chunkWords.filter((word) => queryWords.has(word)).length;
        return {
          doc,
          chunk,
          score: chunkWords.length === 0 ? 0 : matches / Math.max(queryWords.size, 1),
        };
      }),
    )
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  if (ranked.length === 0) {
    return {
      answer:
        'I could not find matching context in the uploaded documents. Try using terms that appear in the file, or upload a more relevant document.',
      sources: [],
      latencyMs: Date.now() - start,
      sessionId,
    };
  }

  const best = ranked[0];
  const sourceList = ranked
    .map((item, index) => `${index + 1}. ${item.doc.name}: ${item.chunk.slice(0, 240).trim()}`)
    .join('\n\n');

  return {
    answer: `Based on ${best.doc.name}, the most relevant context I found is:\n\n${best.chunk
      .slice(0, 700)
      .trim()}\n\nRelevant source excerpts:\n\n${sourceList}`,
    sources: ranked.map((item) => ({
      file: item.doc.name,
      score: Math.min(1, item.score),
      excerpt: item.chunk.slice(0, 300).trim(),
    })),
    latencyMs: Date.now() - start,
    sessionId,
  };
}

async function readUploadFile(file: File): Promise<string> {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    return `PDF file "${file.name}" was uploaded. The browser demo keeps this upload visible, while full PDF text extraction is handled by the backend service when it is online.`;
  }

  return file.text();
}

async function demoSendMessage(question: string, sessionId: string): Promise<ChatResponse> {
  const response = createDemoAnswer(question, sessionId);
  const history = readDemoHistory(sessionId);

  writeDemoHistory(sessionId, [
    ...history,
    {
      id: randomId(),
      role: 'user',
      content: question,
      timestamp: new Date(),
    },
    {
      id: randomId(),
      role: 'assistant',
      content: response.answer,
      sources: response.sources,
      latencyMs: response.latencyMs,
      timestamp: new Date(),
    },
  ]);

  return response;
}

async function demoUploadFiles(files: File[]): Promise<UploadResponse> {
  const docs = await Promise.all(
    files.map(async (file) => ({
      id: randomId(),
      name: file.name,
      content: await readUploadFile(file),
      uploadedAt: new Date().toISOString(),
    })),
  );

  writeDocs([...readDocs(), ...docs]);

  return {
    message: `Stored ${docs.length} file(s) in browser demo mode.`,
    stats: {
      filesProcessed: docs.length,
      chunksCreated: docs.reduce((sum, doc) => sum + Math.max(1, chunkText(doc.content).length), 0),
      elapsedMs: 0,
    },
  };
}

export async function sendMessage(
  question: string,
  sessionId: string,
): Promise<ChatResponse> {
  if (!(await isBackendAvailable())) return demoSendMessage(question, sessionId);

  try {
    const { data } = await apiClient.post<ApiSuccess<ChatResponse>>('/chat', {
      question,
      sessionId,
    });
    return data.data;
  } catch (error) {
    if (shouldFallback(error)) return demoSendMessage(question, sessionId);
    throw error;
  }
}

export async function uploadFiles(
  files: File[],
  onProgress?: (percent: number) => void,
): Promise<UploadResponse> {
  if (!(await isBackendAvailable())) {
    const response = await demoUploadFiles(files);
    onProgress?.(100);
    return response;
  }

  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));

  try {
    const { data } = await apiClient.post<ApiSuccess<UploadResponse>>(
      '/ingest/upload',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (evt) => {
          if (evt.total && onProgress) {
            onProgress(Math.round((evt.loaded * 100) / evt.total));
          }
        },
      },
    );
    return data.data;
  } catch (error) {
    if (!shouldFallback(error)) throw error;
    const response = await demoUploadFiles(files);
    onProgress?.(100);
    return response;
  }
}

export async function getHistory(sessionId: string): Promise<Message[]> {
  if (!(await isBackendAvailable())) return readDemoHistory(sessionId);

  try {
    const { data } = await apiClient.get<
      ApiSuccess<{ sessionId: string; messages: Message[] }>
    >(`/chat/history/${sessionId}`);

    return data.data.messages.map((message) => ({
      ...message,
      timestamp: new Date(message.timestamp),
    }));
  } catch (error) {
    if (shouldFallback(error)) return readDemoHistory(sessionId);
    throw error;
  }
}

export async function clearHistory(sessionId: string): Promise<void> {
  if (await isBackendAvailable()) {
    try {
      await apiClient.delete(`/chat/history/${sessionId}`);
    } catch (error) {
      if (!shouldFallback(error)) throw error;
    }
  }

  if (hasStorage()) localStorage.removeItem(`${DEMO_HISTORY_PREFIX}${sessionId}`);
}

export async function clearKnowledgeBase(): Promise<void> {
  if (await isBackendAvailable()) {
    try {
      await apiClient.post('/ingest/clear');
    } catch (error) {
      if (!shouldFallback(error)) throw error;
    }
  }

  writeDocs([]);
}

export async function getHealth(): Promise<HealthResponse> {
  try {
    const { data } = await apiClient.get<ApiSuccess<HealthResponse>>('/health', {
      timeout: 2_500,
    });
    backendProbe = { ok: true, checkedAt: Date.now() };
    return data.data;
  } catch (error) {
    backendProbe = { ok: false, checkedAt: Date.now() };
    if (!shouldFallback(error)) throw error;
    return {
      status: 'demo',
      uptime: 0,
      services: {
        llm: 'Browser fallback',
        embeddings: 'Keyword matching',
        vectorDb: 'localStorage',
      },
      collection: 'browser-demo',
      timestamp: new Date().toISOString(),
    };
  }
}

export async function getCollectionStatus(): Promise<{ count: number; name: string }> {
  if (!(await isBackendAvailable())) return { count: readDocs().length, name: 'browser-demo' };

  try {
    const { data } = await apiClient.get<ApiSuccess<{ count: number; name: string }>>(
      '/ingest/status',
    );
    return data.data;
  } catch (error) {
    if (!shouldFallback(error)) throw error;
    return { count: readDocs().length, name: 'browser-demo' };
  }
}
