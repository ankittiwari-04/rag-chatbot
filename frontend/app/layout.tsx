import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'RAG Chatbot | AI Knowledge Assistant',
  description:
    'A production-ready Retrieval-Augmented Generation chatbot. Upload your documents and ask questions powered by local AI.',
  keywords: ['RAG', 'AI', 'chatbot', 'knowledge base', 'LLM', 'Ollama', 'ChromaDB'],
  authors: [{ name: 'KnowledgeAI' }],
  openGraph: {
    title: 'RAG Chatbot | AI Knowledge Assistant',
    description: 'Ask questions about your documents using local AI.',
    type: 'website',
    locale: 'en_US',
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} dark`}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body className="antialiased h-full bg-[#0a0a0a] text-[#f5f5f5]">{children}</body>
    </html>
  );
}
