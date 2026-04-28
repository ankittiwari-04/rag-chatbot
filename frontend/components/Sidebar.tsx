'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain,
  MessageSquarePlus,
  Trash2,
  X,
  ChevronLeft,
  Database,
  AlertTriangle,
} from 'lucide-react';
import FileUploader from './FileUploader';
import { clearKnowledgeBase } from '@/lib/api';

interface SidebarProps {
  sessionId: string;
  messageCount: number;
  onNewChat: () => void;
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({
  sessionId,
  messageCount,
  onNewChat,
  isOpen,
  onClose,
}: SidebarProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const [docCount, setDocCount] = useState<number | null>(null);

  const handleClearKnowledgeBase = async () => {
    setIsClearing(true);
    setClearError(null);
    try {
      await clearKnowledgeBase();
      setDocCount(0);
      setShowConfirm(false);
    } catch (err) {
      setClearError(err instanceof Error ? err.message : 'Failed to clear.');
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-20 lg:hidden"
            style={{ background: 'rgba(0,0,0,0.6)' }}
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      {/* Sidebar panel */}
      <motion.aside
        initial={false}
        animate={{ x: isOpen ? 0 : -320 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        className="fixed top-0 left-0 h-full z-30 flex flex-col lg:relative lg:translate-x-0 lg:z-auto"
        style={{
          width: 280,
          background: '#111111',
          borderRight: '1px solid #1f1f1f',
          // Subtle animated gradient right border
          boxShadow: 'inset -1px 0 0 0 #1f1f1f',
        }}
      >
        {/* Animated gradient border on right edge */}
        <div
          className="absolute right-0 top-0 bottom-0 w-px"
          style={{
            background: 'linear-gradient(to bottom, transparent, #6366f130, #8b5cf630, transparent)',
          }}
        />

        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid #1a1a1a' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
            >
              <Brain size={16} color="white" />
            </div>
            <div>
              <h1 className="text-sm font-bold" style={{ color: '#f5f5f5' }}>
                KnowledgeAI
              </h1>
              <p className="text-xs" style={{ color: '#525252' }}>
                RAG Chatbot
              </p>
            </div>
          </div>

          {/* Mobile close */}
          <button
            onClick={onClose}
            className="lg:hidden p-1 rounded-lg transition-colors hover:bg-white/5"
            style={{ color: '#525252' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {/* File uploader section */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#525252' }}>
              Upload Documents
            </p>
            <FileUploader
              onUploadComplete={() => {
                setDocCount((n) => (n !== null ? n + 1 : null));
              }}
            />
          </div>

          {/* Session info */}
          <div
            className="rounded-xl p-3 space-y-2"
            style={{ background: '#0f0f0f', border: '1px solid #1a1a1a' }}
          >
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#525252' }}>
              Session Info
            </p>
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-xs" style={{ color: '#a3a3a3' }}>
                  Messages
                </span>
                <span className="text-xs font-medium" style={{ color: '#f5f5f5' }}>
                  {messageCount}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs" style={{ color: '#a3a3a3' }}>
                  Model
                </span>
                <span
                  className="text-xs font-medium px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(99,102,241,0.12)', color: '#6366f1' }}
                >
                  llama3
                </span>
              </div>
              {docCount !== null && (
                <div className="flex justify-between items-center">
                  <span className="text-xs" style={{ color: '#a3a3a3' }}>
                    Docs ingested
                  </span>
                  <span className="text-xs font-medium" style={{ color: '#f5f5f5' }}>
                    {docCount}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-start">
                <span className="text-xs" style={{ color: '#a3a3a3' }}>
                  Session ID
                </span>
                <span
                  className="text-xs font-mono truncate ml-2 max-w-[120px]"
                  style={{ color: '#525252' }}
                  title={sessionId}
                >
                  {sessionId.slice(0, 8)}…
                </span>
              </div>
            </div>
          </div>

          {/* Clear knowledge base */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#525252' }}>
              Knowledge Base
            </p>
            {!showConfirm ? (
              <button
                onClick={() => setShowConfirm(true)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all hover:opacity-80"
                style={{
                  color: '#ef4444',
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.2)',
                }}
              >
                <Database size={12} />
                Clear Knowledge Base
              </button>
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-xl p-3 space-y-2.5"
                style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle size={14} color="#ef4444" className="flex-shrink-0 mt-0.5" />
                  <p className="text-xs" style={{ color: '#fca5a5' }}>
                    This will permanently delete all ingested documents. Are you sure?
                  </p>
                </div>
                {clearError && (
                  <p className="text-xs" style={{ color: '#ef4444' }}>
                    {clearError}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={handleClearKnowledgeBase}
                    disabled={isClearing}
                    className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-60"
                    style={{ background: '#ef4444', color: 'white' }}
                  >
                    {isClearing ? 'Clearing…' : 'Yes, Clear'}
                  </button>
                  <button
                    onClick={() => { setShowConfirm(false); setClearError(null); }}
                    disabled={isClearing}
                    className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={{ background: '#1f1f1f', color: '#a3a3a3' }}
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        </div>

        {/* Footer — New Chat */}
        <div className="p-4" style={{ borderTop: '1px solid #1a1a1a' }}>
          <button
            onClick={onNewChat}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98]"
            style={{
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              color: 'white',
              boxShadow: '0 4px 16px rgba(99,102,241,0.25)',
            }}
          >
            <MessageSquarePlus size={16} />
            New Chat
          </button>
        </div>
      </motion.aside>

      {/* Desktop collapse button */}
      <button
        onClick={onClose}
        className="hidden lg:flex absolute left-[268px] top-1/2 -translate-y-1/2 z-10 w-5 h-8 items-center justify-center rounded-r-md transition-colors hover:bg-[#1f1f1f]"
        style={{ background: '#1a1a1a', border: '1px solid #1f1f1f', borderLeft: 'none', color: '#525252' }}
      >
        <ChevronLeft size={12} />
      </button>
    </>
  );
}
