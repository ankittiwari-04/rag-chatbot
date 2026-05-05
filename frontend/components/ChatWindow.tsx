'use client';

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  KeyboardEvent,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  Trash2,
  Brain,
  Zap,
  BookOpen,
  FileSearch,
  Menu,
  ChevronDown,
} from 'lucide-react';
import { sendMessage, clearHistory } from '@/lib/api';
import { v4 as uuidv4 } from 'uuid';
import type { Message } from '@/types';
import MessageBubble from './MessageBubble';
import TypingIndicator from './TypingIndicator';

interface ChatWindowProps {
  sessionId: string;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  onSidebarOpen: () => void;
}

const EXAMPLE_QUESTIONS = [
  { icon: BookOpen, text: 'Summarise the key points of this document' },
  { icon: FileSearch, text: 'What are the main topics covered?' },
  { icon: Zap, text: 'Explain the most important concept' },
];

export default function ChatWindow({
  sessionId,
  messages,
  setMessages,
  onSidebarOpen,
}: ChatWindowProps) {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // ── Auto scroll ───────────────────────────────────────────────────────────

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  // Scroll-to-bottom button visibility
  const handleScroll = () => {
    const el = scrollAreaRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBtn(distFromBottom > 120);
  };

  // ── Textarea auto-resize ──────────────────────────────────────────────────

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  }, [input]);

  // ── Send message ──────────────────────────────────────────────────────────

  const handleSend = useCallback(
    async (text?: string) => {
      const question = (text ?? input).trim();
      if (!question || isLoading) return;

      setInput('');
      setError(null);

      const userMsg: Message = {
        id: uuidv4(),
        role: 'user',
        content: question,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);

      try {
        const res = await sendMessage(question, sessionId);
        setLatency(res.latencyMs);

        const assistantMsg: Message = {
          id: uuidv4(),
          role: 'assistant',
          content: res.answer,
          sources: res.sources,
          latencyMs: res.latencyMs,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, assistantMsg]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      } finally {
        setIsLoading(false);
        setTimeout(() => textareaRef.current?.focus(), 50);
      }
    },
    [input, isLoading, sessionId, setMessages],
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearChat = async () => {
    try {
      await clearHistory(sessionId);
      setMessages([]);
      setLatency(null);
      setError(null);
    } catch {
      // silently ignore
    }
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full" style={{ background: '#0a0a0a' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 sm:px-6 py-4 flex-shrink-0"
        style={{ borderBottom: '1px solid #1a1a1a', background: '#0d0d0d' }}
      >
        {/* Left: mobile menu + title */}
        <div className="flex items-center gap-3">
          <button
            onClick={onSidebarOpen}
            className="lg:hidden p-2 rounded-lg hover:bg-white/5 transition-colors"
            style={{ color: '#a3a3a3' }}
          >
            <Menu size={18} />
          </button>

          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
            >
              <Brain size={16} color="white" />
            </div>
            <div>
              <h2 className="text-sm font-bold" style={{ color: '#f5f5f5' }}>
                KnowledgeAI
              </h2>
              <div className="flex items-center gap-2">
                <span
                  className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                  style={{ background: 'rgba(99,102,241,0.12)', color: '#6366f1' }}
                >
                  Gemini
                </span>
                {latency !== null && (
                  <span className="text-xs" style={{ color: '#525252' }}>
                    {latency < 1000 ? `${latency}ms` : `${(latency / 1000).toFixed(1)}s`}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right: clear button */}
        {messages.length > 0 && (
          <button
            onClick={handleClearChat}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80"
            style={{
              color: '#a3a3a3',
              background: '#161616',
              border: '1px solid #1f1f1f',
            }}
          >
            <Trash2 size={12} />
            <span className="hidden sm:inline">Clear chat</span>
          </button>
        )}
      </div>

      {/* Messages */}
      <div
        ref={scrollAreaRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 sm:px-6 py-4"
      >
        {messages.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
            >
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{
                  background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2))',
                  border: '1px solid rgba(99,102,241,0.3)',
                }}
              >
                <Brain size={32} color="#6366f1" />
              </div>
              <h3 className="text-xl font-bold mb-2" style={{ color: '#f5f5f5' }}>
                Ask anything about your documents
              </h3>
              <p className="text-sm max-w-sm" style={{ color: '#525252' }}>
                Upload documents in the sidebar, then ask questions and get AI-powered
                answers grounded in your content.
              </p>
            </motion.div>

            {/* Example chips */}
            <div className="flex flex-wrap justify-center gap-2 max-w-md">
              {EXAMPLE_QUESTIONS.map(({ icon: Icon, text }) => (
                <motion.button
                  key={text}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileHover={{ y: -2, borderColor: '#6366f1' }}
                  onClick={() => handleSend(text)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all"
                  style={{
                    background: '#111111',
                    border: '1px solid #1f1f1f',
                    color: '#a3a3a3',
                  }}
                >
                  <Icon size={14} color="#6366f1" />
                  {text}
                </motion.button>
              ))}
            </div>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </AnimatePresence>
        )}

        {/* Typing indicator */}
        {isLoading && <TypingIndicator />}

        {/* Error banner */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 px-4 py-3 rounded-xl text-sm"
            style={{
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)',
              color: '#fca5a5',
            }}
          >
            Warning: {error}
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to bottom button */}
      <AnimatePresence>
        {showScrollBtn && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => scrollToBottom()}
            className="absolute bottom-24 right-6 w-8 h-8 rounded-full flex items-center justify-center shadow-lg z-10"
            style={{ background: '#6366f1', color: 'white' }}
          >
            <ChevronDown size={16} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Input area */}
      <div
        className="px-4 sm:px-6 py-4 flex-shrink-0"
        style={{ borderTop: '1px solid #1a1a1a', background: '#0d0d0d' }}
      >
        <div
          className="relative flex items-end gap-2 rounded-2xl px-4 py-3 transition-all"
          style={{
            background: '#111111',
            border: '1px solid #1f1f1f',
            boxShadow: input ? '0 0 0 1px rgba(99,102,241,0.3)' : 'none',
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about your documents... (Enter to send, Shift+Enter for newline)"
            disabled={isLoading}
            rows={1}
            className="flex-1 bg-transparent resize-none outline-none text-sm leading-relaxed placeholder-[#525252] disabled:opacity-50"
            style={{ color: '#f5f5f5', maxHeight: 140 }}
          />

          <motion.button
            onClick={() => handleSend()}
            disabled={isLoading || !input.trim()}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: input.trim()
                ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
                : '#1f1f1f',
              color: 'white',
            }}
          >
            <Send size={15} />
          </motion.button>
        </div>

        <p className="text-xs mt-2 text-center" style={{ color: '#2a2a2a' }}>
          AI answers are based on uploaded documents. Always verify critical information.
        </p>
      </div>
    </div>
  );
}
