'use client';

import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { getHistory } from '@/lib/api';
import type { Message } from '@/types';
import Sidebar from '@/components/Sidebar';
import ChatWindow from '@/components/ChatWindow';

const SESSION_KEY = 'rag_session_id';

export default function HomePage() {
  const [sessionId, setSessionId] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // ── Session init ──────────────────────────────────────────────────────────

  useEffect(() => {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = uuidv4();
      localStorage.setItem(SESSION_KEY, id);
    }
    setSessionId(id);
  }, []);

  // ── Load history when session is ready ───────────────────────────────────

  useEffect(() => {
    if (!sessionId) return;

    getHistory(sessionId)
      .then((msgs) => {
        if (msgs.length > 0) setMessages(msgs);
      })
      .catch(() => {
        // Server may not have this session yet — that's fine
      });
  }, [sessionId]);

  // ── New chat ──────────────────────────────────────────────────────────────

  const handleNewChat = useCallback(() => {
    const newId = uuidv4();
    localStorage.setItem(SESSION_KEY, newId);
    setSessionId(newId);
    setMessages([]);
    setSidebarOpen(false); // close on mobile after new chat
  }, []);

  // ─────────────────────────────────────────────────────────────────────────

  if (!sessionId) return null; // hydration guard

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#0a0a0a' }}>
      {/* Sidebar */}
      <Sidebar
        sessionId={sessionId}
        messageCount={messages.length}
        onNewChat={handleNewChat}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main */}
      <main className="flex-1 min-w-0 relative">
        <ChatWindow
          sessionId={sessionId}
          messages={messages}
          setMessages={setMessages}
          onSidebarOpen={() => setSidebarOpen(true)}
        />
      </main>
    </div>
  );
}
