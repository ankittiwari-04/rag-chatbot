import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { retrieve, RetrievedChunk } from './retriever';
import { historyManager } from './history';
import { config } from './config';

export interface ChatSource {
  file: string;
  score: number;
  excerpt: string;
}

export interface ChatResponse {
  answer: string;
  sources: ChatSource[];
  latencyMs: number;
  sessionId: string;
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildPrompt(
  question: string,
  chunks: RetrievedChunk[],
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
): string {
  const systemInstructions = `You are a helpful AI assistant that answers questions based strictly on the provided document context.

Guidelines:
- Answer ONLY from the provided context. Do not use prior knowledge.
- If the context does not contain enough information to answer, say so clearly.
- Be concise but thorough. Use markdown formatting when appropriate (lists, bold, code blocks).
- Cite sources naturally when relevant (e.g., "According to <filename>...").
- Keep a conversational, professional tone.`;

  const contextBlock = chunks
    .map(
      (chunk, i) =>
        `[Context ${i + 1}] (Source: ${chunk.source}, Score: ${(chunk.score * 100).toFixed(1)}%)\n${chunk.content}`,
    )
    .join('\n\n');

  // Last 6 messages from history (3 turns)
  const recentHistory = history.slice(-6);
  const historyBlock =
    recentHistory.length > 0
      ? recentHistory
          .map((m) => `${m.role === 'user' ? 'Human' : 'Assistant'}: ${m.content}`)
          .join('\n')
      : '';

  const parts: string[] = [
    `System: ${systemInstructions}`,
    '',
    '--- Document Context ---',
    contextBlock || 'No relevant document context was found.',
    '--- End of Context ---',
  ];

  if (historyBlock) {
    parts.push('', '--- Conversation History ---', historyBlock, '--- End of History ---');
  }

  parts.push('', `Human: ${question}`, '', 'Assistant:');

  return parts.join('\n');
}

// ─── Main RAG function ────────────────────────────────────────────────────────

export async function askQuestion(
  question: string,
  sessionId: string,
): Promise<ChatResponse> {
  const start = Date.now();

  // 1. Retrieve relevant chunks
  const chunks = await retrieve(question, 4);

  // 2. If the knowledge base is empty, return a friendly message immediately
  if (chunks.length === 0) {
    const answer =
      'No documents have been uploaded to the knowledge base yet. Please upload a PDF, TXT, or Markdown file using the sidebar, then ask your question again.';

    historyManager.addMessage(sessionId, 'user', question);
    historyManager.addMessage(sessionId, 'assistant', answer);

    return {
      answer,
      sources: [],
      latencyMs: Date.now() - start,
      sessionId,
    };
  }

  // 3. Load session history
  const history = historyManager.getHistory(sessionId);

  // 4. Build prompt
  const prompt = buildPrompt(question, chunks, history);

  // 5. Call Gemini 1.5 Flash LLM
  const llm = new ChatGoogleGenerativeAI({
    apiKey: config.GEMINI_API_KEY,
    model: 'gemini-1.5-flash',
    temperature: 0.2,
  });

  const response = await llm.invoke(prompt);
  const answer =
    typeof response.content === 'string'
      ? response.content
      : Array.isArray(response.content)
        ? response.content
            .map((c) => (typeof c === 'string' ? c : 'text' in c ? c.text : ''))
            .join('')
        : String(response.content);

  // 6. Persist to history
  historyManager.addMessage(sessionId, 'user', question);
  historyManager.addMessage(sessionId, 'assistant', answer);

  // 7. Shape sources for the response
  const sources: ChatSource[] = chunks.map((chunk) => ({
    file: chunk.source,
    score: chunk.score,
    excerpt: chunk.content.slice(0, 300).trim(),
  }));

  return {
    answer,
    sources,
    latencyMs: Date.now() - start,
    sessionId,
  };
}
