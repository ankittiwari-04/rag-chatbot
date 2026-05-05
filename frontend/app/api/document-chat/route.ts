import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

interface DocumentContext {
  file: string;
  content: string;
}

function chunkText(content: string, size = 1800): string[] {
  const clean = content.replace(/\s+/g, ' ').trim();
  if (!clean) return [];

  const chunks: string[] = [];
  for (let i = 0; i < clean.length; i += size) {
    chunks.push(clean.slice(i, i + size));
  }
  return chunks;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

function rankContexts(question: string, documents: DocumentContext[]) {
  const queryWords = new Set(tokenize(question));
  const contexts = documents.flatMap((doc) =>
    chunkText(doc.content).map((chunk, index) => {
      const words = tokenize(chunk);
      const matches = words.filter((word) => queryWords.has(word)).length;
      const score = matches / Math.max(queryWords.size, 1);

      return {
        file: doc.file,
        content: chunk,
        score,
        index,
      };
    }),
  );

  const ranked = contexts
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  const overview = contexts.slice(0, 3);
  const combined = [...ranked, ...overview];
  const seen = new Set<string>();

  return combined.filter((item) => {
    const key = `${item.file}:${item.index}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env['GEMINI_API_KEY'];
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'GEMINI_API_KEY is not configured.' },
        { status: 503 },
      );
    }

    const body = (await request.json()) as {
      question?: unknown;
      documents?: unknown;
    };
    const question = typeof body.question === 'string' ? body.question.trim() : '';
    const documents = Array.isArray(body.documents)
      ? (body.documents as Array<{ file?: unknown; content?: unknown }>)
          .map((doc) => ({
            file: typeof doc.file === 'string' ? doc.file : 'document',
            content: typeof doc.content === 'string' ? doc.content : '',
          }))
          .filter((doc) => doc.content.trim().length > 0)
      : [];

    if (question.length < 2) {
      return NextResponse.json(
        { success: false, error: 'Question is required.' },
        { status: 400 },
      );
    }

    if (documents.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No readable document text was provided.' },
        { status: 400 },
      );
    }

    const contexts = rankContexts(question, documents);
    const contextBlock = contexts
      .map(
        (context, index) =>
          `[Source ${index + 1}: ${context.file}]\n${context.content}`,
      )
      .join('\n\n');

    const prompt = `You are KnowledgeAI, a document question-answering assistant.

Answer the user's question using only the uploaded document context below.

Rules:
- If the answer requires reasoning, recommendations, or job-role suggestions, infer them from the document evidence.
- Do not dump raw document text unless the user asks for exact text.
- Give a direct, useful answer first.
- Use concise bullets when helpful.
- Mention "Based on the document" when making recommendations.
- If the document does not contain enough information, say what is missing.

Uploaded document context:
${contextBlock}

User question: ${question}`;

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 900,
      },
    });

    const result = await model.generateContent(prompt);
    const answer = result.response.text().trim();

    return NextResponse.json({
      success: true,
      data: {
        answer,
        sources: contexts.slice(0, 4).map((context) => ({
          file: context.file,
          score: Math.max(0.1, Math.min(1, context.score || 0.7)),
          excerpt: context.content.slice(0, 300).trim(),
        })),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Document chat failed.',
      },
      { status: 500 },
    );
  }
}
