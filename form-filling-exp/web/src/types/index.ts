// Form field types
export interface FormField {
  field_id: string;
  field_type: 'text' | 'checkbox' | 'dropdown' | 'radio';
  page: number;
  label_context: string;
  current_value?: string | null;
  options?: string[] | null;
}

export interface AnalyzeResponse {
  success: boolean;
  message: string;
  fields: FormField[];
  field_count: number;
}

// Agent activity log entry
export interface AgentLogEntry {
  id: string;
  type: 'thinking' | 'tool_call' | 'tool_result' | 'status' | 'complete' | 'error';
  timestamp: Date;
  content: string;
  details?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
}

// Chat message types
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  status?: 'pending' | 'streaming' | 'complete' | 'error';
  toolCalls?: ToolCall[];
  agentLog?: AgentLogEntry[];
}

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
  friendly?: string;
}

// Streaming event types from agent
export interface StreamEvent {
  type: 'init' | 'status' | 'tool_use' | 'user' | 'assistant' | 'complete' | 'pdf_ready' | 'error';
  message?: string;
  error?: string;
  text?: string;
  friendly?: string[];
  tool_calls?: ToolCall[];
  applied_count?: number;
  applied_edits?: Record<string, unknown>;  // All edits applied so far (for multi-turn tracking)
  session_id?: string;  // Agent session ID for resuming conversations
  user_session_id?: string;  // User's form-filling session ID (for concurrent user support)
  pdf_bytes?: string;
}

// Session state
export interface Session {
  id: string;
  originalPdf: File | null;
  filledPdfBytes: Uint8Array | null;
  fields: FormField[];
  messages: ChatMessage[];
  isProcessing: boolean;
}

// PDF display mode
export type PdfDisplayMode = 'original' | 'filled';
