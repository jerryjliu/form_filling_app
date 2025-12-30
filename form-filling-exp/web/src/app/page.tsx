'use client';

import { useState, useCallback, useEffect } from 'react';
import { ChatMessage, FormField, PdfDisplayMode, StreamEvent, AgentLogEntry } from '@/types';
import { analyzePdf, streamAgentFill, hexToBytes, getSessionPdf, getSessionOriginalPdf, streamParseFiles, getSessionContextFiles } from '@/lib/api';
import { ContextFile, ParseProgress } from '@/components/ContextFilesUpload';
import {
  createSession,
  createMessage,
  getSessionIdFromUrl,
  setSessionIdInUrl,
  saveSessionToStorage,
  loadSessionFromStorage,
} from '@/lib/session';
import LeftPanel from '@/components/LeftPanel';
import ChatPanel from '@/components/ChatPanel';

// Helper to generate unique IDs
const generateId = () => Math.random().toString(36).substring(2, 11);

export default function Home() {
  const [sessionId, setSessionId] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [fields, setFields] = useState<FormField[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [originalPdfBytes, setOriginalPdfBytes] = useState<Uint8Array | null>(null);  // For restored sessions
  const [filledPdfBytes, setFilledPdfBytes] = useState<Uint8Array | null>(null);
  const [pdfDisplayMode, setPdfDisplayMode] = useState<PdfDisplayMode>('original');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  // Track applied edits for multi-turn conversations
  const [appliedEdits, setAppliedEdits] = useState<Record<string, unknown> | null>(null);
  // Track agent session ID for resuming conversations (Claude SDK session)
  const [agentSessionId, setAgentSessionId] = useState<string | null>(null);
  // Track user session ID for backend state isolation (concurrent user support)
  const [userSessionId, setUserSessionId] = useState<string | null>(null);
  // Context files for the agent
  const [contextFiles, setContextFiles] = useState<ContextFile[]>([]);
  const [isUploadingContext, setIsUploadingContext] = useState(false);
  const [parseProgress, setParseProgress] = useState<ParseProgress | null>(null);

  // Initialize session from URL or create new one
  useEffect(() => {
    const urlSessionId = getSessionIdFromUrl();

    if (urlSessionId) {
      // Try to load existing session
      const stored = loadSessionFromStorage(urlSessionId);
      console.log('[DEBUG] Loading session from storage:', {
        urlSessionId,
        stored: stored ? { hasFields: stored.fields?.length, hasMessages: stored.messages?.length, userSessionId: stored.userSessionId } : null,
      });
      if (stored) {
        setSessionId(urlSessionId);
        setFields(stored.fields || []);
        setMessages(stored.messages || []);

        // If we have a userSessionId, try to fetch both PDFs from backend
        if (stored.userSessionId) {
          console.log('[DEBUG] Fetching PDFs from backend for userSessionId:', stored.userSessionId);
          setUserSessionId(stored.userSessionId);

          // Fetch both original and filled PDFs and context files in parallel
          Promise.all([
            getSessionPdf(stored.userSessionId),
            getSessionOriginalPdf(stored.userSessionId),
            getSessionContextFiles(stored.userSessionId),
          ]).then(([filledBytes, originalBytes, contextFilesData]) => {
            console.log('[DEBUG] Session fetch results:', {
              hasFilledBytes: !!filledBytes,
              filledSize: filledBytes?.length,
              hasOriginalBytes: !!originalBytes,
              originalSize: originalBytes?.length,
              contextFilesCount: contextFilesData?.length,
            });
            if (filledBytes) {
              setFilledPdfBytes(filledBytes);
              setPdfDisplayMode('filled');
            }
            if (originalBytes) {
              setOriginalPdfBytes(originalBytes);
            }
            if (contextFilesData) {
              setContextFiles(contextFilesData.map(f => ({
                filename: f.filename,
                content: f.content,
                was_parsed: f.was_parsed,
              })));
            }
          });
        }
      } else {
        // Session not found, create new one
        const session = createSession();
        setSessionId(session.id);
        setSessionIdInUrl(session.id);
      }
    } else {
      // No session in URL, create new one
      const session = createSession();
      setSessionId(session.id);
      setSessionIdInUrl(session.id);
    }
  }, []);

  // Save session to storage when it changes
  useEffect(() => {
    if (sessionId) {
      saveSessionToStorage(
        {
          id: sessionId,
          originalPdf: file,
          filledPdfBytes,
          fields,
          messages,
          isProcessing,
        },
        userSessionId
      );
    }
  }, [sessionId, fields, messages, file, filledPdfBytes, isProcessing, userSessionId]);

  // Handle file selection and analysis
  const handleFileSelect = useCallback(async (selectedFile: File | null) => {
    if (!selectedFile) {
      setFile(null);
      setFields([]);
      setOriginalPdfBytes(null);  // Clear restored original PDF
      setFilledPdfBytes(null);
      setPdfDisplayMode('original');
      setAppliedEdits(null);  // Clear edits when resetting
      setAgentSessionId(null);  // Clear agent session when resetting
      setUserSessionId(null);  // Clear user session when resetting
      setContextFiles([]);  // Clear context files when resetting
      return;
    }

    setFile(selectedFile);
    setOriginalPdfBytes(null);  // Clear restored original PDF for new file
    setFilledPdfBytes(null);
    setPdfDisplayMode('original');
    setAppliedEdits(null);  // Clear edits for new file
    setAgentSessionId(null);  // Clear agent session for new file
    setUserSessionId(null);  // Clear user session for new file
    setContextFiles([]);  // Clear context files for new file
    setIsAnalyzing(true);

    try {
      const result = await analyzePdf(selectedFile);
      setFields(result.fields);

      // Add system message about detected fields
      if (result.field_count > 0) {
        setMessages((prev) => [
          ...prev,
          createMessage('system', `Detected ${result.field_count} fillable fields in the PDF`),
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          createMessage('system', 'No fillable form fields detected. Make sure this is a PDF with AcroForm fields.'),
        ]);
      }
    } catch (error) {
      console.error('Analysis error:', error);
      setMessages((prev) => [
        ...prev,
        createMessage('system', `Error analyzing PDF: ${error instanceof Error ? error.message : 'Unknown error'}`),
      ]);
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  // Handle parsing context files
  const handleParseFiles = useCallback(
    async (files: File[], parseMode: 'cost_effective' | 'agentic_plus') => {
      setIsUploadingContext(true);
      setParseProgress(null);

      // Generate a userSessionId if one doesn't exist yet
      // This ensures context files can be stored in the backend session
      let currentUserSessionId = userSessionId;
      if (!currentUserSessionId) {
        currentUserSessionId = generateId() + '-' + Date.now();
        setUserSessionId(currentUserSessionId);
      }

      try {
        const results: ContextFile[] = [];

        for await (const event of streamParseFiles(files, parseMode, currentUserSessionId)) {
          if (event.type === 'progress' && event.current !== undefined && event.total !== undefined && event.filename && event.status) {
            setParseProgress({
              current: event.current,
              total: event.total,
              filename: event.filename,
              status: event.status,
              error: event.error,
            });
          }

          if (event.type === 'complete' && event.results) {
            for (const result of event.results) {
              if (result.content && !result.error) {
                results.push({
                  filename: result.filename,
                  content: result.content,
                  was_parsed: result.parsed,
                });
              }
            }
          }
        }

        // Add new files to existing context files
        setContextFiles((prev) => [...prev, ...results]);
      } catch (error) {
        console.error('Parse files error:', error);
        setMessages((prev) => [
          ...prev,
          createMessage('system', `Error parsing files: ${error instanceof Error ? error.message : 'Unknown error'}`),
        ]);
      } finally {
        setIsUploadingContext(false);
        setParseProgress(null);
      }
    },
    [userSessionId]
  );

  // Handle sending a chat message
  const handleSendMessage = useCallback(
    async (content: string) => {
      if (!file) {
        setMessages((prev) => [
          ...prev,
          createMessage('system', 'Please upload a PDF first'),
        ]);
        return;
      }

      // Add user message
      const userMessage = createMessage('user', content);
      setMessages((prev) => [...prev, userMessage]);

      // Create assistant message placeholder with empty agent log
      const assistantMessage: ChatMessage = {
        ...createMessage('assistant', '', 'streaming'),
        agentLog: [],
      };
      setMessages((prev) => [...prev, assistantMessage]);

      setIsProcessing(true);
      setStatusMessage('Starting agent...');

      // Determine if this is a continuation (we have a previous agent session)
      const isContinuation = Boolean(agentSessionId && filledPdfBytes);

      let finalContent = '';
      let appliedCount = 0;
      let newAppliedEdits: Record<string, unknown> | null = null;
      let newAgentSessionId: string | null = null;
      let newUserSessionId: string | null = null;
      let newFilledPdfBytes: Uint8Array | null = null;

      try {
        for await (const event of streamAgentFill({
          file,
          instructions: content,
          filledPdfBytes: isContinuation ? filledPdfBytes : null,
          isContinuation,
          previousEdits: appliedEdits,
          resumeSessionId: agentSessionId,
          userSessionId: userSessionId,
        })) {
          const logEntry = createLogEntry(event);

          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== assistantMessage.id) return m;

              const updatedLog = logEntry
                ? [...(m.agentLog || []), logEntry]
                : m.agentLog;

              // Update status message for UI
              if (logEntry) {
                setStatusMessage(logEntry.content);
              }

              return {
                ...m,
                agentLog: updatedLog,
              };
            })
          );

          // Handle special events
          if (event.type === 'complete') {
            appliedCount = event.applied_count || 0;
            // Track all applied edits for multi-turn
            if (event.applied_edits) {
              newAppliedEdits = event.applied_edits;
            }
            // Track agent session ID for resuming conversations
            if (event.session_id) {
              newAgentSessionId = event.session_id;
            }
            // Track user session ID for backend state isolation
            if (event.user_session_id) {
              newUserSessionId = event.user_session_id;
            }
            const totalEdits = newAppliedEdits ? Object.keys(newAppliedEdits).length : appliedCount;
            if (isContinuation) {
              finalContent = `Updated ${appliedCount} fields. Total: ${totalEdits} fields filled.`;
            } else {
              finalContent = `Successfully filled ${appliedCount} form fields.`;
            }
          }

          if (event.type === 'pdf_ready' && event.pdf_bytes) {
            const bytes = hexToBytes(event.pdf_bytes);
            newFilledPdfBytes = bytes;
            setFilledPdfBytes(bytes);
            setPdfDisplayMode('filled');
          }

          if (event.type === 'error') {
            finalContent = event.error || 'An error occurred';
          }
        }

        // Update applied edits after successful completion
        if (newAppliedEdits) {
          setAppliedEdits(newAppliedEdits);
        }

        // Update agent session ID for multi-turn conversations
        if (newAgentSessionId) {
          setAgentSessionId(newAgentSessionId);
        }

        // Update user session ID for backend state isolation
        // IMPORTANT: Save to localStorage immediately to ensure it persists even if the tab is closed quickly
        if (newUserSessionId) {
          console.log('[DEBUG] Saving userSessionId to localStorage:', {
            sessionId,
            newUserSessionId,
            hasFields: fields.length,
          });
          setUserSessionId(newUserSessionId);
          // Immediate save to localStorage to prevent data loss on quick tab close
          // Use newFilledPdfBytes since state updates are async
          saveSessionToStorage(
            {
              id: sessionId,
              originalPdf: file,
              filledPdfBytes: newFilledPdfBytes || filledPdfBytes,
              fields,
              messages,
              isProcessing: false,
            },
            newUserSessionId
          );
        }

        // Mark assistant message as complete
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessage.id
              ? {
                  ...m,
                  status: 'complete',
                  content: finalContent || `Filled ${appliedCount} fields.`,
                }
              : m
          )
        );
      } catch (error) {
        console.error('Agent error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessage.id
              ? {
                  ...m,
                  status: 'error',
                  content: `Error: ${errorMessage}`,
                  agentLog: [
                    ...(m.agentLog || []),
                    {
                      id: generateId(),
                      type: 'error' as const,
                      timestamp: new Date(),
                      content: errorMessage,
                    },
                  ],
                }
              : m
          )
        );
      } finally {
        setIsProcessing(false);
        setStatusMessage('');
      }
    },
    [file, filledPdfBytes, appliedEdits, agentSessionId, userSessionId, sessionId, fields, messages]
  );

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="flex-shrink-0 px-6 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-purple-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-semibold">Form Filler</h1>
            <p className="text-xs text-foreground-muted">AI-powered PDF form completion</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {sessionId && (
            <div className="text-xs text-foreground-muted">
              Session: {sessionId.slice(0, 8)}...
            </div>
          )}
          <a
            href="/docs"
            target="_blank"
            className="text-xs text-foreground-muted hover:text-accent transition-colors"
          >
            API Docs
          </a>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left panel - PDF upload and preview */}
        <div className="w-1/2 border-r border-border flex flex-col overflow-hidden">
          <LeftPanel
            file={file}
            onFileSelect={handleFileSelect}
            fields={fields}
            originalPdfBytes={originalPdfBytes}
            filledPdfBytes={filledPdfBytes}
            pdfDisplayMode={pdfDisplayMode}
            onPdfDisplayModeChange={setPdfDisplayMode}
            isAnalyzing={isAnalyzing}
            isProcessing={isProcessing}
          />
        </div>

        {/* Right panel - Chat interface */}
        <div className="w-1/2 flex flex-col overflow-hidden">
          <ChatPanel
            messages={messages}
            onSendMessage={handleSendMessage}
            isProcessing={isProcessing}
            disabled={!file || fields.length === 0}
            statusMessage={statusMessage}
            contextFiles={contextFiles}
            onContextFilesChange={setContextFiles}
            onParseFiles={handleParseFiles}
            isUploadingContext={isUploadingContext}
            parseProgress={parseProgress}
          />
        </div>
      </main>
    </div>
  );
}

// Create a log entry from a stream event
function createLogEntry(event: StreamEvent): AgentLogEntry | null {
  const id = generateId();
  const timestamp = new Date();

  switch (event.type) {
    case 'init':
      return {
        id,
        type: 'status',
        timestamp,
        content: event.message || 'Initializing agent...',
      };

    case 'status':
      return {
        id,
        type: 'status',
        timestamp,
        content: event.message || 'Processing...',
      };

    case 'tool_use':
      if (event.friendly && event.friendly.length > 0) {
        // Clean up markdown formatting
        const cleanedActions = event.friendly.map((f) => f.replace(/\*\*/g, ''));

        if (event.friendly.length > 1) {
          return {
            id,
            type: 'tool_call',
            timestamp,
            content: `Filling ${event.friendly.length} fields`,
            details: cleanedActions.join(', '),
          };
        } else {
          return {
            id,
            type: 'tool_call',
            timestamp,
            content: cleanedActions[0],
          };
        }
      }
      return null;

    case 'user':
      // Tool results - event.friendly is string[] from StreamEvent
      if (event.friendly && event.friendly.length > 0) {
        return {
          id,
          type: 'tool_result',
          timestamp,
          content: event.friendly.join(', '),
        };
      }
      return null;

    case 'assistant':
      if (event.text) {
        return {
          id,
          type: 'thinking',
          timestamp,
          content: 'Agent thinking...',
          details: event.text.slice(0, 100) + (event.text.length > 100 ? '...' : ''),
        };
      }
      return null;

    case 'complete':
      return {
        id,
        type: 'complete',
        timestamp,
        content: `Completed - filled ${event.applied_count || 0} fields`,
      };

    case 'error':
      return {
        id,
        type: 'error',
        timestamp,
        content: event.error || 'An error occurred',
      };

    case 'pdf_ready':
      return {
        id,
        type: 'complete',
        timestamp,
        content: 'Form filled successfully',
      };

    default:
      return null;
  }
}
