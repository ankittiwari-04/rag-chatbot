import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RAG Chatbot | AI Knowledge Assistant',
  description:
    'A production-ready Retrieval-Augmented Generation chatbot. Upload your documents and ask questions powered by a cloud LLM API.',
  keywords: ['RAG', 'AI', 'chatbot', 'knowledge base', 'LLM', 'Gemini', 'Qdrant', 'cloud API'],
  authors: [{ name: 'KnowledgeAI' }],
  openGraph: {
    title: 'RAG Chatbot | AI Knowledge Assistant',
    description: 'Ask questions about your documents using a cloud LLM API.',
    type: 'website',
    locale: 'en_US',
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body className="antialiased h-full bg-[#0a0a0a] text-[#f5f5f5]">{children}</body>
    </html>
  );
}
