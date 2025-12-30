'use client';

import { useState } from 'react';
import { AgentLogEntry } from '@/types';

interface AgentActivityLogProps {
  entries: AgentLogEntry[];
  currentStatus?: string;
  isStreaming: boolean;
}

function LogIcon({ type }: { type: AgentLogEntry['type'] }) {
  const baseClass = "w-3.5 h-3.5 flex-shrink-0";

  switch (type) {
    case 'thinking':
      return (
        <svg className={`${baseClass} text-foreground-muted`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      );
    case 'tool_call':
      return (
        <svg className={`${baseClass} text-accent`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    case 'tool_result':
      return (
        <svg className={`${baseClass} text-success`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      );
    case 'status':
      return (
        <svg className={`${baseClass} text-warning`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'complete':
      return (
        <svg className={`${baseClass} text-success`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'error':
      return (
        <svg className={`${baseClass} text-error`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
  }
}

export default function AgentActivityLog({ entries, currentStatus, isStreaming }: AgentActivityLogProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (entries.length === 0 && !isStreaming) {
    return null;
  }

  // Get the latest meaningful entry for the collapsed view
  const latestEntry = entries.length > 0 ? entries[entries.length - 1] : null;
  const displayStatus = currentStatus || (latestEntry?.content) || 'Processing...';

  return (
    <div className="rounded-xl bg-background-tertiary border border-border overflow-hidden">
      {/* Collapsed view - current status with expand toggle */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-border/30 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          {isStreaming && (
            <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin flex-shrink-0" />
          )}
          {!isStreaming && latestEntry && (
            <LogIcon type={latestEntry.type} />
          )}
          <span className="text-sm text-foreground-secondary truncate">
            {displayStatus}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {entries.length > 0 && (
            <span className="text-xs text-foreground-muted px-2 py-0.5 rounded-full bg-background-secondary">
              {entries.length} {entries.length === 1 ? 'step' : 'steps'}
            </span>
          )}
          <svg
            className={`w-4 h-4 text-foreground-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded view - full activity log */}
      {isExpanded && (
        <div className="border-t border-border max-h-[300px] overflow-y-auto">
          <div className="p-3 space-y-1">
            {entries.map((entry, idx) => (
              <div
                key={entry.id}
                className="flex items-start gap-2 py-1.5 px-2 rounded-lg hover:bg-background-secondary/50 transition-colors animate-fadeIn"
              >
                <LogIcon type={entry.type} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${
                      entry.type === 'error' ? 'text-error' :
                      entry.type === 'complete' ? 'text-success' :
                      entry.type === 'tool_call' ? 'text-accent' :
                      'text-foreground-secondary'
                    }`}>
                      {entry.content}
                    </span>
                    <span className="text-xs text-foreground-muted">
                      {formatTime(entry.timestamp)}
                    </span>
                  </div>
                  {entry.details && (
                    <p className="text-xs text-foreground-muted mt-0.5 font-mono truncate">
                      {entry.details}
                    </p>
                  )}
                </div>

                {/* Step number */}
                <span className="text-xs text-foreground-muted tabular-nums">
                  #{idx + 1}
                </span>
              </div>
            ))}

            {/* Current streaming indicator */}
            {isStreaming && (
              <div className="flex items-center gap-2 py-1.5 px-2 text-xs text-foreground-muted">
                <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                <span>Waiting for next action...</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}
