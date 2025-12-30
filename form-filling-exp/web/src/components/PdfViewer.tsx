'use client';

import { useEffect, useState } from 'react';
import { PdfDisplayMode } from '@/types';
import { createPdfUrl, downloadPdf } from '@/lib/api';

interface PdfViewerProps {
  originalFile: File | null;
  originalPdfBytes: Uint8Array | null;  // For restored sessions
  filledPdfBytes: Uint8Array | null;
  mode: PdfDisplayMode;
  onModeChange: (mode: PdfDisplayMode) => void;
}

export default function PdfViewer({
  originalFile,
  originalPdfBytes,
  filledPdfBytes,
  mode,
  onModeChange,
}: PdfViewerProps) {
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [filledUrl, setFilledUrl] = useState<string | null>(null);

  // Create object URLs for PDFs
  useEffect(() => {
    // Prefer File if available, otherwise use restored bytes
    if (originalFile) {
      const url = URL.createObjectURL(originalFile);
      setOriginalUrl(url);
      return () => URL.revokeObjectURL(url);
    } else if (originalPdfBytes) {
      const url = createPdfUrl(originalPdfBytes);
      setOriginalUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setOriginalUrl(null);
    }
  }, [originalFile, originalPdfBytes]);

  useEffect(() => {
    if (filledPdfBytes) {
      const url = createPdfUrl(filledPdfBytes);
      setFilledUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setFilledUrl(null);
    }
  }, [filledPdfBytes]);

  const hasFilledPdf = filledPdfBytes !== null;
  const hasOriginalPdf = originalFile !== null || originalPdfBytes !== null;

  // Determine which URL to show:
  // - If mode is 'filled' and we have filledUrl, show that
  // - Otherwise show originalUrl if available
  // - If no originalUrl but we have filledUrl (restored session), show filledUrl
  const currentUrl = mode === 'filled' && filledUrl
    ? filledUrl
    : (originalUrl || filledUrl);

  const handleDownload = () => {
    if (filledPdfBytes) {
      const filename = originalFile
        ? originalFile.name.replace('.pdf', '_filled.pdf')
        : 'filled_form.pdf';
      downloadPdf(filledPdfBytes, filename);
    }
  };

  // Only show empty state if we have neither original nor filled PDF
  if (!originalFile && !originalPdfBytes && !filledPdfBytes) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background-secondary rounded-lg border border-border">
        <div className="text-center text-foreground-muted">
          <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p>Upload a PDF to preview</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-background-secondary rounded-lg border border-border overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-background-tertiary">
        <div className="flex items-center gap-2">
          {/* Toggle buttons - only show if we have both original and filled */}
          {hasOriginalPdf && hasFilledPdf && (
            <div className="flex rounded-lg bg-background-secondary p-0.5">
              <button
                onClick={() => onModeChange('original')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  mode === 'original'
                    ? 'bg-accent text-white'
                    : 'text-foreground-muted hover:text-foreground-secondary'
                }`}
              >
                Original
              </button>
              <button
                onClick={() => onModeChange('filled')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  mode === 'filled'
                    ? 'bg-accent text-white'
                    : 'text-foreground-muted hover:text-foreground-secondary'
                }`}
              >
                Filled
              </button>
            </div>
          )}

          {/* Show label when we only have filled PDF (restored session) */}
          {!hasOriginalPdf && hasFilledPdf && (
            <span className="flex items-center gap-1 text-xs text-foreground-muted">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
              </svg>
              Restored session
            </span>
          )}

          {mode === 'filled' && hasFilledPdf && hasOriginalPdf && (
            <span className="flex items-center gap-1 text-xs text-success">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Form filled
            </span>
          )}
        </div>

        {/* Download button */}
        {hasFilledPdf && (
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-success/10 text-success hover:bg-success/20 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download
          </button>
        )}
      </div>

      {/* PDF iframe */}
      <div className="flex-1 bg-background">
        {currentUrl ? (
          <iframe
            src={`${currentUrl}#toolbar=0`}
            className="w-full h-full"
            title="PDF Preview"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-foreground-muted">
            Loading PDF...
          </div>
        )}
      </div>
    </div>
  );
}
