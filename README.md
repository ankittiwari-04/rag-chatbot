# KnowledgeAI - RAG Knowledge-Base Chatbot

A production-ready Retrieval-Augmented Generation chatbot for asking questions over uploaded documents.

Live demo: https://rag-chatbot-ten-delta.vercel.app/

The app uses a hosted backend when `NEXT_PUBLIC_API_URL` is configured. If that backend is unavailable, the frontend falls back to a browser-local demo mode so the live link can still ingest TXT/Markdown files and answer with source excerpts.

## Features

- Upload PDF, TXT, and Markdown documents
- Ask questions with session-based chat history
- Source cards with similarity-style scores and excerpts
- Gemini-powered backend with Qdrant vector search
- Browser fallback mode for resilient demos
- Responsive dark UI built with Next.js, Tailwind CSS, and Framer Motion
- Backend deployment manifest for Render
- Frontend deployment config for Vercel

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS |
| UI | Framer Motion, Lucide React, React Markdown |
| Backend | Node.js, Express, TypeScript |
| LLM | Google Gemini 1.5 Flash |
| Embeddings | Google text-embedding-004 |
| Vector DB | Qdrant Cloud |
| File parsing | Multer, pdf-parse |
| Hosting | Vercel frontend, Render backend |

## Project Structure

```text
.
├── backend/      # Express API, ingestion, retrieval, Gemini/Qdrant RAG chain
├── frontend/     # Next.js app and browser fallback demo mode
├── render.yaml   # Render backend blueprint
└── vercel.json   # Vercel frontend config
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
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

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
| `GET` | `/api/health` | Service health and model metadata |
| `POST` | `/api/chat` | Ask a question |
| `GET` | `/api/chat/history/:sessionId` | Load session history |
| `DELETE` | `/api/chat/history/:sessionId` | Clear session history |
| `POST` | `/api/ingest/upload` | Upload and ingest documents |
| `POST` | `/api/ingest/clear` | Clear the Qdrant collection |
| `GET` | `/api/ingest/status` | Get collection document count |

## Deployment

### Backend on Render

1. Create a Render Blueprint from this repository.
2. Render will read `render.yaml`.
3. Add these secret environment variables in Render:

```env
GEMINI_API_KEY=...
QDRANT_URL=...
QDRANT_API_KEY=...
```

### Frontend on Vercel

1. Import the GitHub repository into Vercel.
2. Keep the root deployment using `vercel.json`.
3. Set this environment variable:

```env
NEXT_PUBLIC_API_URL=https://your-render-backend.onrender.com/api
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

For a quick demo test, open the frontend, upload `test-doc.txt`, and ask a question about the document.
