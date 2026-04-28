export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  latencyMs?: number;
  timestamp: Date;
}

export interface Source {
  file: string;
  score: number;
  excerpt: string;
}

export interface Session {
  id: string;
  createdAt: Date;
  messageCount: number;
  lastMessage?: string;
}

export interface UploadedFile {
  name: string;
  size: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

export interface ChatResponse {
  answer: string;
  sources: Source[];
  latencyMs: number;
  sessionId: string;
}

export interface UploadResponse {
  message: string;
  stats: {
    filesProcessed: number;
    chunksCreated: number;
    elapsedMs: number;
  };
}

export interface HealthResponse {
  status: string;
  uptime: number;
  models: {
    llm: string;
    embeddings: string;
  };
  collection: string;
  timestamp: string;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: string;
  details?: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
