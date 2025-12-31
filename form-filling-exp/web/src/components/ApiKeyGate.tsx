'use client';

import { useState, useEffect } from 'react';
import { validateApiKey } from '@/lib/api';

const API_KEY_STORAGE_KEY = 'llama-cloud-api-key';

interface ApiKeyGateProps {
  children: React.ReactNode;
  onApiKeyValidated: (apiKey: string) => void;
}

export default function ApiKeyGate({ children, onApiKeyValidated }: ApiKeyGateProps) {
  const [apiKey, setApiKey] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isValidated, setIsValidated] = useState(false);
  const [isCheckingStored, setIsCheckingStored] = useState(true);

  // Check for stored API key on mount
  useEffect(() => {
    const storedKey = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (storedKey) {
      // Validate the stored key
      setIsValidating(true);
      validateApiKey(storedKey)
        .then(() => {
          setIsValidated(true);
          onApiKeyValidated(storedKey);
        })
        .catch(() => {
          // Stored key is invalid, clear it
          localStorage.removeItem(API_KEY_STORAGE_KEY);
        })
        .finally(() => {
          setIsCheckingStored(false);
          setIsValidating(false);
        });
    } else {
      setIsCheckingStored(false);
    }
  }, [onApiKeyValidated]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!apiKey.trim()) {
      setError('Please enter an API key');
      return;
    }

    setIsValidating(true);
    setError(null);

    try {
      await validateApiKey(apiKey.trim());
      // Store the key
      localStorage.setItem(API_KEY_STORAGE_KEY, apiKey.trim());
      setIsValidated(true);
      onApiKeyValidated(apiKey.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to validate API key');
    } finally {
      setIsValidating(false);
    }
  };

  // Show loading while checking stored key
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

        {/* API Key Form */}
        <div className="bg-background-secondary rounded-xl p-6 border border-border">
          <h2 className="text-lg font-semibold text-foreground mb-2">Enter Your API Key</h2>
          <p className="text-sm text-foreground-muted mb-6">
            This app requires a LlamaCloud API key to function. Your key is stored locally and never sent to our servers.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="apiKey" className="block text-sm font-medium text-foreground-secondary mb-2">
                LlamaCloud API Key
              </label>
              <input
                id="apiKey"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="llx-..."
                disabled={isValidating}
                className="w-full px-4 py-3 rounded-lg bg-background border border-border text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent disabled:opacity-50"
              />
            </div>

            {error && (
              <div className="px-4 py-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isValidating || !apiKey.trim()}
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
              Don&apos;t have an account?{' '}
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
              Need help getting your API key?{' '}
              <a
                href="https://developers.llamaindex.ai/python/cloud/general/api_key/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline font-medium"
              >
                See documentation
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

// Export helper to get stored API key
export function getStoredApiKey(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(API_KEY_STORAGE_KEY);
}

// Export helper to clear stored API key
export function clearStoredApiKey(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(API_KEY_STORAGE_KEY);
}
