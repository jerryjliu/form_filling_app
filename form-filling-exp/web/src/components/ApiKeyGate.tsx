'use client';

import { useState, useEffect } from 'react';
import { validateApiKey, validateAnthropicApiKey } from '@/lib/api';

const LLAMA_API_KEY_STORAGE_KEY = 'llama-cloud-api-key';
const ANTHROPIC_API_KEY_STORAGE_KEY = 'anthropic-api-key';

interface ApiKeyGateProps {
  children: React.ReactNode;
  onApiKeysValidated: (llamaApiKey: string, anthropicApiKey: string) => void;
}

export default function ApiKeyGate({ children, onApiKeysValidated }: ApiKeyGateProps) {
  const [llamaApiKey, setLlamaApiKey] = useState('');
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [llamaError, setLlamaError] = useState<string | null>(null);
  const [anthropicError, setAnthropicError] = useState<string | null>(null);
  const [isValidated, setIsValidated] = useState(false);
  const [isCheckingStored, setIsCheckingStored] = useState(true);

  // Check for stored API keys on mount
  useEffect(() => {
    const storedLlamaKey = localStorage.getItem(LLAMA_API_KEY_STORAGE_KEY);
    const storedAnthropicKey = localStorage.getItem(ANTHROPIC_API_KEY_STORAGE_KEY);

    if (storedLlamaKey && storedAnthropicKey) {
      // Validate both stored keys
      setIsValidating(true);
      Promise.all([
        validateApiKey(storedLlamaKey).catch(() => null),
        validateAnthropicApiKey(storedAnthropicKey).catch(() => null),
      ])
        .then(([llamaResult, anthropicResult]) => {
          if (llamaResult && anthropicResult) {
            setIsValidated(true);
            onApiKeysValidated(storedLlamaKey, storedAnthropicKey);
          } else {
            // One or both keys are invalid, clear invalid ones
            if (!llamaResult) {
              localStorage.removeItem(LLAMA_API_KEY_STORAGE_KEY);
            }
            if (!anthropicResult) {
              localStorage.removeItem(ANTHROPIC_API_KEY_STORAGE_KEY);
            }
          }
        })
        .finally(() => {
          setIsCheckingStored(false);
          setIsValidating(false);
        });
    } else {
      setIsCheckingStored(false);
    }
  }, [onApiKeysValidated]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setLlamaError(null);
    setAnthropicError(null);

    // Validate both keys are provided
    if (!llamaApiKey.trim()) {
      setLlamaError('Please enter a LlamaCloud API key');
      return;
    }
    if (!anthropicApiKey.trim()) {
      setAnthropicError('Please enter an Anthropic API key');
      return;
    }

    setIsValidating(true);

    try {
      // Validate both keys in parallel
      const [llamaResult, anthropicResult] = await Promise.allSettled([
        validateApiKey(llamaApiKey.trim()),
        validateAnthropicApiKey(anthropicApiKey.trim()),
      ]);

      // Check LlamaCloud key result
      if (llamaResult.status === 'rejected') {
        setLlamaError(llamaResult.reason instanceof Error ? llamaResult.reason.message : 'Failed to validate LlamaCloud API key');
      }

      // Check Anthropic key result
      if (anthropicResult.status === 'rejected') {
        setAnthropicError(anthropicResult.reason instanceof Error ? anthropicResult.reason.message : 'Failed to validate Anthropic API key');
      }

      // If both are valid, store and proceed
      if (llamaResult.status === 'fulfilled' && anthropicResult.status === 'fulfilled') {
        localStorage.setItem(LLAMA_API_KEY_STORAGE_KEY, llamaApiKey.trim());
        localStorage.setItem(ANTHROPIC_API_KEY_STORAGE_KEY, anthropicApiKey.trim());
        setIsValidated(true);
        onApiKeysValidated(llamaApiKey.trim(), anthropicApiKey.trim());
      }
    } finally {
      setIsValidating(false);
    }
  };

  // Show loading while checking stored keys
  if (isCheckingStored) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-foreground-muted">
          <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  // Show main app if validated
  if (isValidated) {
    return <>{children}</>;
  }

  // Show API key entry form
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent to-purple-600 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-foreground">PDF Form Filler</h1>
          <p className="text-foreground-muted mt-2">AI-powered PDF form completion</p>
        </div>

        {/* API Keys Form */}
        <div className="bg-background-secondary rounded-xl p-6 border border-border">
          <h2 className="text-lg font-semibold text-foreground mb-2">Enter Your API Keys</h2>
          <p className="text-sm text-foreground-muted mb-6">
            This app requires both a LlamaCloud API key (for document parsing) and an Anthropic API key (for AI processing). Your keys are stored locally and never sent to our servers.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* LlamaCloud API Key */}
            <div>
              <label htmlFor="llamaApiKey" className="block text-sm font-medium text-foreground-secondary mb-2">
                LlamaCloud API Key
              </label>
              <input
                id="llamaApiKey"
                type="password"
                value={llamaApiKey}
                onChange={(e) => setLlamaApiKey(e.target.value)}
                placeholder="llx-..."
                disabled={isValidating}
                className="w-full px-4 py-3 rounded-lg bg-background border border-border text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent disabled:opacity-50"
              />
              {llamaError && (
                <div className="mt-2 px-3 py-2 rounded-lg bg-error/10 border border-error/20 text-error text-sm">
                  {llamaError}
                </div>
              )}
            </div>

            {/* Anthropic API Key */}
            <div>
              <label htmlFor="anthropicApiKey" className="block text-sm font-medium text-foreground-secondary mb-2">
                Anthropic API Key
              </label>
              <input
                id="anthropicApiKey"
                type="password"
                value={anthropicApiKey}
                onChange={(e) => setAnthropicApiKey(e.target.value)}
                placeholder="sk-ant-..."
                disabled={isValidating}
                className="w-full px-4 py-3 rounded-lg bg-background border border-border text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent disabled:opacity-50"
              />
              {anthropicError && (
                <div className="mt-2 px-3 py-2 rounded-lg bg-error/10 border border-error/20 text-error text-sm">
                  {anthropicError}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={isValidating || !llamaApiKey.trim() || !anthropicApiKey.trim()}
              className="w-full px-4 py-3 rounded-lg bg-accent text-white font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {isValidating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Validating...
                </>
              ) : (
                'Continue'
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-border space-y-2">
            <p className="text-xs text-foreground-muted text-center">
              Don&apos;t have a LlamaCloud account?{' '}
              <a
                href="https://cloud.llamaindex.ai/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline font-medium"
              >
                Sign up for LlamaCloud
              </a>
            </p>
            <p className="text-xs text-foreground-muted text-center">
              Don&apos;t have an Anthropic account?{' '}
              <a
                href="https://console.anthropic.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline font-medium"
              >
                Sign up for Anthropic
              </a>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-xs text-foreground-muted text-center mt-6">
          Powered by Claude Agent SDK and LlamaParse
        </p>
      </div>
    </div>
  );
}

// Export helper to get stored LlamaCloud API key
export function getStoredLlamaApiKey(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(LLAMA_API_KEY_STORAGE_KEY);
}

// Export helper to get stored Anthropic API key
export function getStoredAnthropicApiKey(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ANTHROPIC_API_KEY_STORAGE_KEY);
}

// Export helper to clear stored API keys
export function clearStoredApiKeys(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(LLAMA_API_KEY_STORAGE_KEY);
  localStorage.removeItem(ANTHROPIC_API_KEY_STORAGE_KEY);
}

// Backwards-compatible alias (deprecated)
export function getStoredApiKey(): string | null {
  return getStoredLlamaApiKey();
}

// Backwards-compatible alias (deprecated)
export function clearStoredApiKey(): void {
  clearStoredApiKeys();
}
