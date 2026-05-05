# KnowledgeAI - RAG Knowledge-Base Chatbot

A production-ready Retrieval-Augmented Generation chatbot for asking questions over uploaded documents.

Live demo: https://rag-chatbot-ten-delta.vercel.app/

The deployed app does not require Ollama or the developer's local machine. It uses cloud-hosted Gemini APIs for document Q&A, with Qdrant Cloud available for the hosted Express backend. The Vercel frontend also includes a server-side `/api/document-chat` route so uploaded PDF/TXT/Markdown files can be answered directly from the live demo even if the separate Render backend is unavailable.

## Features

- Upload readable PDF, TXT, and Markdown documents
- Ask broad or specific questions based on the uploaded document
- Cloud Gemini answer generation from the Vercel server route
- Express RAG backend with Gemini embeddings and Qdrant vector search
- Browser-side PDF text extraction and resilient fallback answers
- Source cards with excerpts
- Responsive dark UI built with Next.js, Tailwind CSS, and Framer Motion
- Render backend manifest and Vercel frontend deployment config

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS |
| UI | Framer Motion, Lucide React, React Markdown |
| Serverless document chat | Vercel Route Handler + Google Gemini Cloud |
| Backend | Node.js, Express, TypeScript |
| LLM | Google Gemini Cloud |
| Embeddings | Google text-embedding-004 |
| Vector DB | Qdrant Cloud |
| File parsing | Browser pdf.js fallback, backend Multer + pdf-parse |
| Hosting | Vercel frontend, Render backend |

## Project Structure

```text
.
|-- backend/      # Express API, ingestion, retrieval, Gemini/Qdrant RAG chain
|-- frontend/     # Next.js app, Vercel cloud document chat, browser fallback
|-- render.yaml   # Render backend blueprint
\-- vercel.json   # Vercel frontend config
```

## Local Setup

### 1. Install dependencies

```bash
cd backend
npm install

cd ../frontend
npm install
```

### 2. Configure the backend

Create `backend/.env`:

```env
GEMINI_API_KEY=your_gemini_api_key
QDRANT_URL=https://your-qdrant-cluster-url
QDRANT_API_KEY=your_qdrant_api_key
QDRANT_COLLECTION=rag-knowledge-base
PORT=3001
FRONTEND_URL=http://localhost:3000
MAX_FILE_SIZE_MB=10
```

### 3. Configure the frontend

Create `frontend/.env.local`:

```env
GEMINI_API_KEY=your_gemini_api_key
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

`GEMINI_API_KEY` is used only by the Next.js server route. It is never exposed to the browser. `NEXT_PUBLIC_API_URL` is optional for the hosted Express backend. To enable that separate backend in the browser, also set `NEXT_PUBLIC_ENABLE_HOSTED_BACKEND=true`; otherwise the live demo answers from uploaded document text through the Vercel route and browser fallback.

### 4. Run locally

```bash
cd backend
npm run dev
```

```bash
cd frontend
npm run dev
```

Open http://localhost:3000.

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Express backend health and model metadata |
| `POST` | `/api/chat` | Ask a question through the Express RAG backend |
| `GET` | `/api/chat/history/:sessionId` | Load Express backend session history |
| `DELETE` | `/api/chat/history/:sessionId` | Clear Express backend session history |
| `POST` | `/api/ingest/upload` | Upload and ingest documents into Qdrant |
| `POST` | `/api/ingest/clear` | Clear the Qdrant collection |
| `GET` | `/api/ingest/status` | Get collection document count |
| `POST` | `/api/document-chat` | Vercel serverless cloud Gemini Q&A over browser-extracted documents |

## Deployment

### Frontend on Vercel

1. Import the GitHub repository into Vercel.
2. Keep the root deployment using `vercel.json`.
3. Set this server-side environment variable in Vercel:

```env
GEMINI_API_KEY=...
```

4. Optionally set the hosted Express backend URL:

```env
NEXT_PUBLIC_API_URL=https://your-render-backend.onrender.com/api
NEXT_PUBLIC_ENABLE_HOSTED_BACKEND=true
```

### Backend on Render

1. Create a Render Blueprint from this repository.
2. Render will read `render.yaml`.
3. Add these secret environment variables in Render:

```env
GEMINI_API_KEY=...
QDRANT_URL=...
QDRANT_API_KEY=...
```

After pushing to `main`, Vercel and Render can auto-deploy from GitHub.

## Verification

```bash
cd backend
npm run type-check
npm run build

cd ../frontend
npm run type-check
npm run build
```

Production smoke test:

1. Open https://rag-chatbot-ten-delta.vercel.app/
2. Upload a readable PDF.
3. Ask several unrelated document questions, for example:
   - "Summarize this document."
   - "What roles should this candidate target?"
   - "What skills are mentioned?"
   - "What information is missing?"

The app should answer from the uploaded document and say when the PDF does not contain enough information.
