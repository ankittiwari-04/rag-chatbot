'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronDown, ChevronUp, Clock, Copy, Check } from 'lucide-react';
import type { Message } from '@/types';
import SourceCard from './SourceCard';

interface MessageBubbleProps {
  message: Message;
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 p-1.5 rounded-md transition-all opacity-0 group-hover:opacity-100"
      style={{ background: '#1f1f1f', color: '#a3a3a3' }}
      title="Copy code"
    >
      {copied ? <Check size={12} color="#22c55e" /> : <Copy size={12} />}
    </button>
  );
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const isUser = message.role === 'user';
  const hasSources = message.sources && message.sources.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={`flex items-start gap-3 mb-4 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold mt-1 ${
          isUser
            ? 'bg-indigo-500 text-white'
            : 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white'
        }`}
      >
        {isUser ? 'U' : 'AI'}
      </div>

      {/* Content */}
      <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[80%]`}>
        {/* Bubble */}
        <div
          className="relative rounded-2xl px-4 py-3"
          style={
            isUser
              ? {
                  background: '#6366f1',
                  color: '#ffffff',
                  borderRadius: '16px 4px 16px 16px',
                }
              : {
                  background: '#1a1a1a',
                  border: '1px solid #1f1f1f',
                  color: '#f5f5f5',
                  borderRadius: '4px 16px 16px 16px',
                }
          }
        >
          {isUser ? (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose-dark text-sm">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // Custom code block with copy button
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  code({ inline, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className ?? '');
                    if (!inline && match) {
                      return (
                        <div className="relative group my-3">
                          <div
                            className="text-xs px-3 py-1 font-mono"
                            style={{
                              background: '#1a1a1a',
                              color: '#6366f1',
                              borderBottom: '1px solid #1f1f1f',
                              borderRadius: '6px 6px 0 0',
                            }}
                          >
                            {match[1]}
                          </div>
                          <pre
                            className="m-0 rounded-t-none overflow-x-auto"
                            style={{
                              background: '#0d0d0d',
                              border: '1px solid #1f1f1f',
                              borderTop: 'none',
                              borderRadius: '0 0 6px 6px',
                              padding: '1rem',
                            }}
                          >
                            <code
                              className={className}
                              style={{ color: '#e2e8f0', fontSize: '0.82em' }}
                              {...props}
                            >
                              {children}
                            </code>
                          </pre>
                          <CopyButton text={String(children)} />
                        </div>
                      );
                    }
                    return (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Sources + latency (assistant only) */}
        {!isUser && (
          <div className="mt-2 w-full">
            <div className="flex items-center gap-3 flex-wrap">
              {/* Latency badge */}
              {message.latencyMs !== undefined && (
                <span
                  className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                  style={{ color: '#a3a3a3', background: '#161616', border: '1px solid #1f1f1f' }}
                >
                  <Clock size={10} />
                  {message.latencyMs < 1000
                    ? `${message.latencyMs}ms`
                    : `${(message.latencyMs / 1000).toFixed(1)}s`}
                </span>
              )}

              {/* Sources toggle */}
              {hasSources && (
                <button
                  onClick={() => setSourcesOpen((o) => !o)}
                  className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full transition-all hover:border-indigo-500/50"
                  style={{
                    color: '#6366f1',
                    background: 'rgba(99,102,241,0.08)',
                    border: '1px solid rgba(99,102,241,0.2)',
                  }}
                >
                  {sourcesOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                  {message.sources!.length} source{message.sources!.length !== 1 ? 's' : ''}
                </button>
              )}
            </div>

            {/* Sources list */}
            <AnimatePresence>
              {sourcesOpen && hasSources && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden mt-2"
                >
                  <div className="grid gap-2">
                    {message.sources!.map((source, i) => (
                      <SourceCard key={i} source={source} index={i} />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Timestamp */}
        <span className="text-xs mt-1" style={{ color: '#525252' }}>
          {formatTime(message.timestamp instanceof Date ? message.timestamp : new Date(message.timestamp))}
        </span>
      </div>
    </motion.div>
  );
}
