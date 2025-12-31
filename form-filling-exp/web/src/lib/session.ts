import { Session, ChatMessage, FormField, AgentLogEntry } from '@/types';

// Generate a random session ID
export function generateSessionId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Create a new session
export function createSession(): Session {
  return {
    id: generateSessionId(),
    originalPdf: null,
    filledPdfBytes: null,
    fields: [],
    messages: [],
    isProcessing: false,
  };
}

// Create a new chat message
export function createMessage(
  role: 'user' | 'assistant' | 'system',
  content: string,
  status?: ChatMessage['status']
): ChatMessage {
  return {
    id: Math.random().toString(36).substring(2, 15),
    role,
    content,
    timestamp: new Date(),
    status,
    toolCalls: [],
  };
}

// URL session persistence helpers
export function getSessionIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  return params.get('session');
}

export function setSessionIdInUrl(sessionId: string) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.set('session', sessionId);
  window.history.replaceState({}, '', url.toString());
}

// Local storage helpers for session persistence (basic implementation)
const STORAGE_KEY = 'form-filler-sessions';

// Stored version of AgentLogEntry with string timestamps
interface StoredAgentLogEntry {
  id: string;
  type: AgentLogEntry['type'];
  timestamp: string;
  content: string;
  details?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
}

interface StoredSession {
  id: string;
  fields: FormField[];
  messages: Array<{
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: string;
    status?: ChatMessage['status'];
    agentLog?: StoredAgentLogEntry[];
  }>;
  // Backend session ID for fetching PDF on reload
  userSessionId?: string;
  // Note: We don't store PDF bytes in localStorage due to size limitations
  // PDF is fetched from backend using userSessionId on reload
}

export function saveSessionToStorage(session: Session, userSessionId?: string | null) {
  if (typeof window === 'undefined') return;

  console.log('[DEBUG session.ts] saveSessionToStorage called:', {
    sessionId: session.id,
    userSessionId,
    fieldsCount: session.fields.length,
    messagesCount: session.messages.length,
  });

  try {
    const stored: StoredSession = {
      id: session.id,
      fields: session.fields,
      messages: session.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp.toISOString(),
        status: m.status,
        agentLog: m.agentLog?.map((log) => ({
          ...log,
          timestamp: log.timestamp.toISOString(),
        })),
      })),
      userSessionId: userSessionId || undefined,
    };

    const sessions = getStoredSessions();
    sessions[session.id] = stored;

    // Keep only last 10 sessions
    const keys = Object.keys(sessions);
    if (keys.length > 10) {
      delete sessions[keys[0]];
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    console.log('[DEBUG session.ts] Session saved successfully');
  } catch (e) {
    console.warn('Failed to save session to localStorage', e);
  }
}

export interface LoadedSession extends Partial<Session> {
  userSessionId?: string;
}

export function loadSessionFromStorage(sessionId: string): LoadedSession | null {
  if (typeof window === 'undefined') return null;

  console.log('[DEBUG session.ts] loadSessionFromStorage called for:', sessionId);

  try {
    const sessions = getStoredSessions();
    const stored = sessions[sessionId];

    console.log('[DEBUG session.ts] Found stored session:', stored ? {
      id: stored.id,
      fieldsCount: stored.fields?.length,
      messagesCount: stored.messages?.length,
      userSessionId: stored.userSessionId,
    } : null);

    if (!stored) return null;

    return {
      id: stored.id,
      fields: stored.fields,
      messages: stored.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: new Date(m.timestamp),
        status: m.status,
        agentLog: m.agentLog?.map((log) => ({
          ...log,
          timestamp: new Date(log.timestamp),
        })),
      })),
      userSessionId: stored.userSessionId,
    };
  } catch (e) {
    console.warn('[DEBUG session.ts] Error loading session:', e);
    return null;
  }
}

function getStoredSessions(): Record<string, StoredSession> {
  if (typeof window === 'undefined') return {};

  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}
