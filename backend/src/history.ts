export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface SessionData {
  messages: Message[];
  lastActivity: Date;
}

const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const MAX_MESSAGES_PER_SESSION = 20;
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

export class ChatHistoryManager {
  private sessions: Map<string, SessionData> = new Map();
  private cleanupTimer: NodeJS.Timeout;

  constructor() {
    // Periodically purge expired sessions
    this.cleanupTimer = setInterval(() => {
      this.purgeExpired();
    }, CLEANUP_INTERVAL_MS);

    // Allow process to exit even if timer is active
    this.cleanupTimer.unref();
  }

  addMessage(sessionId: string, role: 'user' | 'assistant', content: string): void {
    const now = new Date();

    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, { messages: [], lastActivity: now });
    }

    const session = this.sessions.get(sessionId)!;
    session.lastActivity = now;

    session.messages.push({ role, content, timestamp: now });

    // Sliding window — keep last MAX_MESSAGES_PER_SESSION messages
    if (session.messages.length > MAX_MESSAGES_PER_SESSION) {
      session.messages = session.messages.slice(
        session.messages.length - MAX_MESSAGES_PER_SESSION,
      );
    }
  }

  getHistory(sessionId: string): Message[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    // Update last activity on read
    session.lastActivity = new Date();
    return [...session.messages];
  }

  clearHistory(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  listSessions(): Array<{ sessionId: string; messageCount: number; lastActivity: Date }> {
    return Array.from(this.sessions.entries()).map(([sessionId, data]) => ({
      sessionId,
      messageCount: data.messages.length,
      lastActivity: data.lastActivity,
    }));
  }

  private purgeExpired(): void {
    const now = Date.now();
    for (const [sessionId, data] of this.sessions.entries()) {
      if (now - data.lastActivity.getTime() > SESSION_TTL_MS) {
        this.sessions.delete(sessionId);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupTimer);
    this.sessions.clear();
  }
}

// Singleton instance shared across the app
export const historyManager = new ChatHistoryManager();
