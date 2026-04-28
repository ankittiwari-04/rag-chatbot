# 🧠 KnowledgeAI — RAG Knowledge-Base Chatbot

> A production-ready Retrieval-Augmented Generation (RAG) chatbot. Upload your documents and get AI-powered answers grounded in your own content — running fully local with Ollama.

![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)
![Express](https://img.shields.io/badge/Express-4.x-404040?logo=express)
![LangChain](https://img.shields.io/badge/LangChain-0.3-1C3C3C?logo=langchain)
![ChromaDB](https://img.shields.io/badge/ChromaDB-1.9-orange)
![Ollama](https://img.shields.io/badge/Ollama-local-black)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker)
![License](https://img.shields.io/badge/license-MIT-green)

---

## ✨ Features

- 📄 **Document ingestion** — Upload PDF, TXT, and Markdown files
- 🔍 **Semantic search** — ChromaDB vector store with cosine similarity
- 🤖 **Local AI** — Ollama with llama3 (no API keys needed)
- 💬 **Multi-turn chat** — History preserved per session (2-hour TTL)
- 📊 **Source transparency** — See which chunks answered your question with similarity scores
- ⚡ **Real-time progress** — Actual upload progress bars, not fake loaders
- 🌙 **Dark-mode UI** — Premium dark design with framer-motion animations
- 📱 **Responsive** — Works on mobile and desktop
- 🚀 **Production-ready** — Railway + Vercel + GitHub Actions CI/CD

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│                     Browser                          │
│           Next.js 14 (App Router + Tailwind)         │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP (axios)
                       ▼
┌─────────────────────────────────────────────────────┐
│               Express.js Backend (Node 20)           │
│  ┌─────────┐  ┌──────────┐  ┌────────────────────┐  │
│  │ /health │  │ /chat    │  │ /ingest            │  │
│  └─────────┘  └────┬─────┘  └────────┬───────────┘  │
│                    │                 │               │
│           ┌────────▼─────────────────▼────────────┐  │
│           │          LangChain Core               │  │
│           │  chain.ts ◄── retriever.ts            │  │
│           │  history.ts (in-memory Map)           │  │
│           └──────────┬──────────────┬─────────────┘  │
│                      │              │               │
│              ┌───────▼──────┐  ┌───▼────────────┐  │
│              │   ChromaDB   │  │   Ollama       │  │
│              │ (Docker)     │  │ llama3         │  │
│              │ nomic-embed  │  │ nomic-embed    │  │
│              └──────────────┘  └────────────────┘  │
└─────────────────────────────────────────────────────┘
```

---

## 📋 Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 20+ | Runtime |
| Docker Desktop | Latest | ChromaDB |
| Ollama | Latest | Local LLM |
| Git | Latest | Version control |

---

## 🚀 Local Setup

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/rag-chatbot.git
cd rag-chatbot
```

### 2. Start ChromaDB with Docker

```bash
docker run -d \
  --name chromadb \
  -p 8000:8000 \
  chromadb/chroma
```

### 3. Install and start Ollama

```bash
# Install from https://ollama.com then pull models:
ollama pull llama3
ollama pull nomic-embed-text
```

### 4. Start the backend

```bash
cd backend
npm install
npm run dev
# Backend running on http://localhost:3001
```

### 5. Start the frontend

```bash
cd frontend
npm install
npm run dev
# Frontend running on http://localhost:3000
```

### 6. Open the app

Navigate to **http://localhost:3000**, upload a document, and start asking questions!

---

## 📁 Adding Your Own Documents

**Option A — Via the UI**
1. Open the sidebar (left panel)
2. Drag & drop or click to select PDF/TXT/MD files
3. Click **Upload & Ingest**

**Option B — Via CLI**
```bash
cd backend
# Place files in the docs/ directory
cp my-document.pdf docs/
npm run ingest
```

---

## 📡 API Reference

| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| `GET` | `/api/health` | — | Server status, models, collection |
| `POST` | `/api/chat` | `{ question, sessionId? }` | `{ answer, sources, latencyMs, sessionId }` |
| `GET` | `/api/chat/history/:id` | — | Message history for session |
| `DELETE` | `/api/chat/history/:id` | — | Clears session history |
| `POST` | `/api/ingest/upload` | `multipart/form-data` (files) | `{ message, stats }` |
| `POST` | `/api/ingest/clear` | — | Clears entire knowledge base |
| `GET` | `/api/ingest/status` | — | Collection document count |

### Chat request example

```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the main topic of the document?", "sessionId": "my-session"}'
```

### Upload example

```bash
curl -X POST http://localhost:3001/api/ingest/upload \
  -F "files=@document.pdf" \
  -F "files=@notes.txt"
```

---

## 🌍 Deployment

### Railway (Backend + ChromaDB)

1. Create a new **Railway** project at https://railway.app
2. Add a **ChromaDB** service:
   - Source: Docker image `chromadb/chroma`
   - Port: `8000`
3. Add the **Backend** service:
   - Source: GitHub repo, root directory `/backend`
   - Set environment variables:
     ```
     OLLAMA_BASE_URL=<your-ollama-url>
     LLM_MODEL=llama3
     EMBED_MODEL=nomic-embed-text
     CHROMA_URL=<railway-internal-chromadb-url>
     COLLECTION_NAME=rag-knowledge-base
     PORT=3001
     FRONTEND_URL=https://your-app.vercel.app
     MAX_FILE_SIZE_MB=10
     ```

### Vercel (Frontend)

1. Import the GitHub repo at https://vercel.com/new
2. Set **Root Directory** to `frontend`
3. Add environment variable:
   ```
   NEXT_PUBLIC_API_URL=https://your-backend.railway.app/api
   ```
4. Click **Deploy**

### GitHub Actions Secrets

Add these in your repo **Settings → Secrets → Actions**:

| Secret | Value |
|--------|-------|
| `RAILWAY_WEBHOOK` | Railway deploy webhook URL |
| `VERCEL_WEBHOOK` | Vercel deploy hook URL |
| `NEXT_PUBLIC_API_URL` | Your Railway backend URL |

### Push to GitHub

```bash
git init
git add .
git commit -m "feat: initial RAG chatbot implementation"
git remote add origin https://github.com/YOUR_USERNAME/rag-chatbot.git
git branch -M main
git push -u origin main
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, TypeScript, Tailwind CSS, framer-motion |
| UI Components | shadcn/ui, lucide-react, react-markdown |
| Backend | Node.js 20, Express.js, TypeScript |
| AI Orchestration | LangChain, @langchain/ollama, @langchain/community |
| LLM | Ollama (llama3) — runs locally |
| Embeddings | Ollama (nomic-embed-text) |
| Vector DB | ChromaDB (Docker) |
| File Parsing | multer, pdf-parse |
| Logging | pino, pino-http |
| Validation | Zod |
| CI/CD | GitHub Actions |
| Hosting | Railway (backend), Vercel (frontend) |

---

## 📝 License

MIT © KnowledgeAI
