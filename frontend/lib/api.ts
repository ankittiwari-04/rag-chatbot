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

  if (/\b(job\s*roles?|roles?|target|apply|career|position|positions|suitable|fit)\b/.test(normalized)) {
    return 'career';
  }
  if (/\b(introduction|introduce|interview intro|pitch|profile summary|about me)\b/.test(normalized)) {
    return 'intro';
  }
  if (/\b(impact|measurable|metric|metrics|result|results|reduced|increased|improved|percent|percentage|business value|outcome)\b/.test(normalized)) {
    return 'impact';
  }
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
    career: ['skill', 'skills', 'project', 'projects', 'experience', 'developer', 'engineer', 'role', 'job'],
    intro: ['name', 'profile', 'skills', 'experience', 'project', 'education', 'developer', 'engineer'],
    impact: ['impact', 'metric', 'metrics', 'result', 'reduced', 'increased', 'improved', 'percent', 'percentage', 'time', 'reporting', 'business'],
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
  const numberBoost = /\d|percent|percentage|reduced|increased|improved|saved|faster|slower/i.test(text)
    ? 3
    : 0;
  const headingBoost = getIntentTerms(intent).some((term) =>
    text.toLowerCase().includes(`${term}:`),
  )
    ? 2
    : 0;

  return queryMatches * 2 + intentMatches * 3 + headingBoost + (intent === 'impact' ? numberBoost : 0);
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

  const matches = ranked
    .filter((item) => intent === 'overview' || item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (matches.length > 0) return matches;

  return docs
    .flatMap((doc) =>
      chunkText(doc.content, 700).slice(0, 3).map((chunk, index) => ({
        doc,
        chunk,
        score: index === 0 ? 0.2 : 0.1,
      })),
    )
    .slice(0, 5);
}

function createBulletList(items: RankedContext[]): string {
  return items
    .map((item) => `- ${item.chunk.slice(0, 360).trim()} (${item.doc.name})`)
    .join('\n');
}

function hasAny(text: string, terms: string[]): boolean {
  const normalized = text.toLowerCase();
  return terms.some((term) => normalized.includes(term));
}

function createCareerAdvice(docs: DemoDocument[], ranked: RankedContext[]): string {
  const fullText = docs.map((doc) => doc.content).join('\n').toLowerCase();
  const roles: Array<{ title: string; reason: string }> = [];

  if (hasAny(fullText, ['react', 'next.js', 'nextjs', 'html5', 'css3', 'tailwind'])) {
    roles.push({
      title: 'Frontend Developer / React Developer',
      reason: 'the document mentions React, Next.js, HTML/CSS, and frontend-oriented UI skills.',
    });
  }

  if (hasAny(fullText, ['node.js', 'nodejs', 'express', 'api', 'rest'])) {
    roles.push({
      title: 'Backend Developer - Node.js',
      reason: 'the document includes Node.js, Express, and API/backend skills.',
    });
  }

  if (
    hasAny(fullText, ['react', 'next.js', 'nextjs']) &&
    hasAny(fullText, ['node.js', 'nodejs', 'express', 'mongodb', 'postgresql', 'mysql'])
  ) {
    roles.push({
      title: 'Full Stack Developer / MERN Stack Developer',
      reason: 'the profile combines frontend skills with backend and database experience.',
    });
  }

  if (hasAny(fullText, ['rag', 'langchain', 'vector', 'embedding', 'qdrant', 'chromadb', 'ollama', 'gemini'])) {
    roles.push({
      title: 'AI Application Developer / RAG Chatbot Developer',
      reason: 'the document mentions RAG pipelines, vector embeddings, LangChain, Gemini/Ollama, or vector databases.',
    });
  }

  if (hasAny(fullText, ['typescript', 'javascript']) && hasAny(fullText, ['git', 'github', 'docker', 'postman'])) {
    roles.push({
      title: 'Junior Software Engineer',
      reason: 'the document shows programming fundamentals plus common engineering tools.',
    });
  }

  const uniqueRoles = roles.filter(
    (role, index, list) => list.findIndex((item) => item.title === role.title) === index,
  );
  const recommendedRoles = uniqueRoles.length > 0
    ? uniqueRoles
    : [
        {
          title: 'Entry-Level Software Developer',
          reason: 'the document contains software development education, skills, or projects.',
        },
      ];

  const roleLines = recommendedRoles
    .slice(0, 5)
    .map((role, index) => `${index + 1}. **${role.title}** - ${role.reason}`)
    .join('\n');

  const evidence = ranked.length > 0
    ? ranked
        .slice(0, 3)
        .map((item) => `- ${item.chunk.slice(0, 260).trim()} (${item.doc.name})`)
        .join('\n')
    : docs
        .slice(0, 2)
        .map((doc) => `- ${doc.content.slice(0, 260).trim()} (${doc.name})`)
        .join('\n');

  return `Based on the uploaded document, you should target these roles:\n\n${roleLines}\n\nBest first targets: **Full Stack Developer**, **Frontend React Developer**, and **Junior Software Engineer**. If you want to highlight the RAG/chatbot project strongly, also apply for **AI Application Developer** or **LLM/RAG Developer** internships and junior roles.\n\nEvidence from the document:\n${evidence}`;
}

function createIntroAnswer(docs: DemoDocument[], ranked: RankedContext[]): string {
  const fullText = docs.map((doc) => doc.content).join(' ');
  const nameMatch = fullText.match(/\b(?:Name:\s*)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/);
  const name = nameMatch?.[1] ?? 'This candidate';
  const evidence = ranked
    .slice(0, 4)
    .map((item) => item.chunk)
    .join(' ');

  const skillHints = [
    'React',
    'Next.js',
    'Node.js',
    'TypeScript',
    'Python',
    'FastAPI',
    'LangChain',
    'Gemini',
    'vector search',
    'PostgreSQL',
    'Docker',
  ].filter((skill) => fullText.toLowerCase().includes(skill.toLowerCase()));
  const focus = /healthcare/i.test(fullText)
    ? 'healthcare analytics and AI document automation'
    : /rag|document|langchain|gemini|vector/i.test(fullText)
      ? 'AI document applications and RAG-based systems'
      : 'software development';

  return `Based on the document, a short interview introduction could be:\n\n\"Hi, I am ${name}, a software developer focused on ${focus}. I have worked with ${skillHints.slice(0, 6).join(', ') || 'modern software technologies'}, and the document highlights experience with ${evidence.slice(0, 260).trim()}. I am interested in roles where I can build practical, user-focused software and apply these skills to real business problems.\"`;
}

function createFallbackAnswer(question: string, intent: string, ranked: RankedContext[]): string {
  if (intent === 'overview') {
    return ranked[0].chunk.slice(0, 900).trim();
  }

  const hasStrongMatch = ranked.some((item) => item.score >= 1);
  const evidence = createBulletList(ranked);
  const normalizedQuestion = question.trim().replace(/\s+/g, ' ');

  if (!hasStrongMatch) {
    return `I could not find an exact answer to "${normalizedQuestion}" in the uploaded document. The closest relevant information I found is:\n\n${evidence}\n\nIf you want, ask about a specific name, skill, project, education detail, contact detail, date, result, or role mentioned in the PDF.`;
  }

  if (intent === 'impact') {
    return `The measurable impact or result mentioned in the document is:\n\n${evidence}`;
  }

  return evidence;
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
    intent === 'career'
      ? createCareerAdvice(docsWithContent, ranked)
      : intent === 'intro'
      ? createIntroAnswer(docsWithContent, ranked)
      : intent === 'overview'
      ? createFallbackAnswer(question, intent, ranked)
      : createFallbackAnswer(question, intent, ranked);
  const intro =
    intent === 'career'
      ? ''
      : intent === 'overview'
      ? `Here is a concise overview of ${best.doc.name}:`
      : `Here is what I found for your question about ${intent === 'specific' ? 'the document' : intent}:`;

  return {
    answer: `${intro ? `${intro}\n\n` : ''}${answerBody}\n\nRelevant source excerpts:\n\n${sourceList}`,
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

async function askDocumentApi(
  question: string,
  sessionId: string,
  docs: DemoDocument[],
): Promise<ChatResponse | null> {
  try {
    const startedAt = Date.now();
    const response = await fetch('/api/document-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        documents: docs.map((doc) => ({
          file: doc.name,
          content: doc.content.slice(0, 60_000),
        })),
      }),
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as {
      success: boolean;
      data?: {
        answer: string;
        sources: ChatResponse['sources'];
      };
    };

    if (!payload.success || !payload.data?.answer) return null;

    return {
      answer: payload.data.answer,
      sources: payload.data.sources ?? [],
      latencyMs: Date.now() - startedAt,
      sessionId,
    };
  } catch {
    return null;
  }
}

async function demoSendMessage(question: string, sessionId: string): Promise<ChatResponse> {
  const docs = readDocs().filter((doc) => doc.content.trim().length > 0);
  const response = (await askDocumentApi(question, sessionId, docs)) ?? createDemoAnswer(question, sessionId);
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
