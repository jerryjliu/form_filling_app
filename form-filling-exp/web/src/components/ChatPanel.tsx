'use client';

import { useState, useRef, useEffect } from 'react';
import { ChatMessage as ChatMessageType } from '@/types';
import ChatMessage from './ChatMessage';

interface ChatPanelProps {
  messages: ChatMessageType[];
  onSendMessage: (message: string) => void;
  isProcessing: boolean;
  disabled?: boolean;
  statusMessage?: string;
}

export default function ChatPanel({
  messages,
  onSendMessage,
  isProcessing,
  disabled,
  statusMessage,
}: ChatPanelProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    if (!disabled) {
      inputRef.current?.focus();
    }
  }, [disabled]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isProcessing && !disabled) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold">Chat</h2>
        <p className="text-xs text-foreground-muted">
          Describe what to fill in natural language
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h3 className="text-sm font-medium text-foreground-secondary mb-1">
              Start a conversation
            </h3>
            <p className="text-xs text-foreground-muted max-w-[200px]">
              Upload a PDF and describe what fields you want to fill
            </p>

            {/* Example prompts */}
            <div className="mt-6 space-y-2 w-full max-w-[280px]">
              <p className="text-xs text-foreground-muted">Try something like:</p>
              {[
                'My name is John Doe, email john@example.com',
                'Fill the date with today, check all boxes',
                'Address: 123 Main St, San Francisco CA',
              ].map((example, idx) => (
                <button
                  key={idx}
                  onClick={() => setInput(example)}
                  disabled={disabled}
                  className="w-full text-left px-3 py-2 text-xs rounded-lg bg-background-tertiary text-foreground-secondary hover:bg-border transition-colors disabled:opacity-50"
                >
                  &ldquo;{example}&rdquo;
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}

        {/* Status indicator */}
        {isProcessing && statusMessage && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/10 text-accent text-sm animate-fadeIn">
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            {statusMessage}
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-border">
        <div className="relative">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={disabled ? 'Upload a PDF first...' : 'Type your instructions...'}
            disabled={disabled || isProcessing}
            rows={3}
            className="w-full px-4 py-3 pr-12 rounded-xl bg-background-tertiary border border-border text-sm text-foreground placeholder:text-foreground-muted resize-none focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={!input.trim() || isProcessing || disabled}
            className="absolute right-3 bottom-3 p-2 rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isProcessing ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </button>
        </div>
        <p className="mt-2 text-xs text-foreground-muted">
          Press Enter to send, Shift+Enter for new line
        </p>
      </form>
    </div>
  );
}
