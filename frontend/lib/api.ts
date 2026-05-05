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

interface RankedContext {
  doc: DemoDocument;
  chunk: string;
  score: number;
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

function sentenceSplit(content: string): string[] {
  return content
    .replace(/\r/g, '\n')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .filter((sentence) => sentence.length > 20);
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

function getQuestionIntent(question: string): string {
  const normalized = question.toLowerCase();

  if (/\b(skill|skills|tech stack|technology|technologies|tools?)\b/.test(normalized)) {
    return 'skills';
  }
  if (/\b(project|projects|portfolio|built|created|developed)\b/.test(normalized)) {
    return 'projects';
  }
  if (/\b(experience|work|job|role|company|employment)\b/.test(normalized)) {
    return 'experience';
  }
  if (/\b(education|degree|college|university|school|cgpa|gpa)\b/.test(normalized)) {
    return 'education';
  }
  if (/\b(contact|email|phone|linkedin|github|address)\b/.test(normalized)) {
    return 'contact';
  }
  if (/\b(name|who is|candidate|person)\b/.test(normalized)) {
    return 'identity';
  }
  if (/\b(summary|summar|overview|inside|about|explain|document|resume|cv|tell me|what is this)\b/.test(normalized)) {
    return 'overview';
  }

  return 'specific';
}

function getIntentTerms(intent: string): string[] {
  const terms: Record<string, string[]> = {
    skills: ['skill', 'skills', 'technology', 'technologies', 'tools', 'stack', 'programming', 'framework'],
    projects: ['project', 'projects', 'built', 'created', 'developed', 'application', 'app', 'system'],
    experience: ['experience', 'work', 'job', 'role', 'company', 'intern', 'employment', 'responsibilities'],
    education: ['education', 'degree', 'college', 'university', 'school', 'cgpa', 'gpa', 'course'],
    contact: ['email', 'phone', 'linkedin', 'github', 'contact', 'address'],
    identity: ['name', 'candidate', 'profile', 'resume'],
    overview: [],
    specific: [],
  };

  return terms[intent] ?? [];
}

function scoreText(text: string, queryWords: Set<string>, intent: string): number {
  const words = tokenize(text);
  if (words.length === 0) return 0;

  const intentTerms = new Set(getIntentTerms(intent));
  const queryMatches = words.filter((word) => queryWords.has(word)).length;
  const intentMatches = words.filter((word) => intentTerms.has(word)).length;
  const headingBoost = getIntentTerms(intent).some((term) =>
    text.toLowerCase().includes(`${term}:`),
  )
    ? 2
    : 0;

  return queryMatches * 2 + intentMatches * 3 + headingBoost;
}

function rankContexts(docs: DemoDocument[], question: string, intent: string): RankedContext[] {
  const queryWords = new Set(tokenize(question));
  const useSentenceMode = intent !== 'overview';
  const ranked = docs.flatMap((doc) => {
    const units = useSentenceMode ? sentenceSplit(doc.content) : chunkText(doc.content);
    return units.map((chunk) => ({
      doc,
      chunk,
      score: scoreText(chunk, queryWords, intent),
    }));
  });

  return ranked
    .filter((item) => intent === 'overview' || item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function createBulletList(items: RankedContext[]): string {
  return items
    .map((item) => `- ${item.chunk.slice(0, 360).trim()} (${item.doc.name})`)
    .join('\n');
}

function randomId(): string {
  return crypto.randomUUID();
}

function createDemoAnswer(question: string, sessionId: string): ChatResponse {
  const start = Date.now();
  const docs = readDocs();
  const intent = getQuestionIntent(question);

  const docsWithContent = docs.filter((doc) => doc.content.trim().length > 0);

  if (docsWithContent.length === 0) {
    return {
      answer:
        'No readable document text is available yet. Upload a PDF, TXT, or Markdown file, then ask a question about it. The hosted backend will be used automatically when it is online.',
      sources: [],
      latencyMs: Date.now() - start,
      sessionId,
    };
  }

  const ranked = rankContexts(docsWithContent, question, intent);

  if (ranked.length === 0) {
    const availableFiles = docsWithContent.map((doc) => doc.name).join(', ');
    return {
      answer:
        `I could not find matching context in the uploaded documents (${availableFiles}). Try asking with names, skills, dates, sections, or keywords that appear in the file.`,
      sources: [],
      latencyMs: Date.now() - start,
      sessionId,
    };
  }

  const best = ranked[0];
  const sourceList = ranked
    .map((item, index) => `${index + 1}. ${item.doc.name}: ${item.chunk.slice(0, 240).trim()}`)
    .join('\n\n');
  const answerBody =
    intent === 'overview'
      ? best.chunk.slice(0, 900).trim()
      : createBulletList(ranked);
  const intro =
    intent === 'overview'
      ? `Here is a concise overview of ${best.doc.name}:`
      : `Here is what I found for your question about ${intent === 'specific' ? 'the document' : intent}:`;

  return {
    answer: `${intro}\n\n${answerBody}\n\nRelevant source excerpts:\n\n${sourceList}`,
    sources: ranked.map((item) => ({
      file: item.doc.name,
      score: intent === 'overview' ? 1 : Math.min(1, item.score / 10),
      excerpt: item.chunk.slice(0, 300).trim(),
    })),
    latencyMs: Date.now() - start,
    sessionId,
  };
}

async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/legacy/build/pdf.worker.mjs`;
  const data = new Uint8Array(await file.arrayBuffer());
  const loadTask = pdfjs.getDocument({ data });
  const pdf = await loadTask.promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (pageText) pages.push(pageText);
  }

  const text = pages.join('\n\n').trim();
  if (!text) {
    throw new Error(`Could not extract readable text from ${file.name}.`);
  }

  return text;
}

async function readUploadFile(file: File): Promise<string> {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    return extractPdfText(file);
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

  writeDocs(docs);

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
