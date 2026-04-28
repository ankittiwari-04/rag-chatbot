import axios, { AxiosError } from 'axios';
import type {
  ChatResponse,
  UploadResponse,
  Message,
  HealthResponse,
  ApiSuccess,
} from '@/types';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 120_000, // 2 minutes for LLM responses
  headers: { 'Content-Type': 'application/json' },
});

// ─── Response interceptor — normalise errors ──────────────────────────────────

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ success: false; error: string; details?: string }>) => {
    const message =
      error.response?.data?.error ??
      error.response?.data?.details ??
      error.message ??
      'An unexpected error occurred.';
    return Promise.reject(new Error(message));
  },
);

// ─── API functions ────────────────────────────────────────────────────────────

export async function sendMessage(
  question: string,
  sessionId: string,
): Promise<ChatResponse> {
  const { data } = await apiClient.post<ApiSuccess<ChatResponse>>('/chat', {
    question,
    sessionId,
  });
  return data.data;
}

export async function uploadFiles(
  files: File[],
  onProgress?: (percent: number) => void,
): Promise<UploadResponse> {
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));

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
}

export async function getHistory(sessionId: string): Promise<Message[]> {
  const { data } = await apiClient.get<
    ApiSuccess<{ sessionId: string; messages: Message[] }>
  >(`/chat/history/${sessionId}`);

  // Rehydrate Date objects
  return data.data.messages.map((m) => ({ ...m, timestamp: new Date(m.timestamp) }));
}

export async function clearHistory(sessionId: string): Promise<void> {
  await apiClient.delete(`/chat/history/${sessionId}`);
}

export async function clearKnowledgeBase(): Promise<void> {
  await apiClient.post('/ingest/clear');
}

export async function getHealth(): Promise<HealthResponse> {
  const { data } = await apiClient.get<ApiSuccess<HealthResponse>>('/health');
  return data.data;
}

export async function getCollectionStatus(): Promise<{ count: number; name: string }> {
  const { data } = await apiClient.get<ApiSuccess<{ count: number; name: string }>>(
    '/ingest/status',
  );
  return data.data;
}
