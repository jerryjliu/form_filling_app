'use client';

import { useEffect, useState } from 'react';
import { PdfDisplayMode } from '@/types';
import { createPdfUrl, downloadPdf } from '@/lib/api';

interface PdfViewerProps {
  originalFile: File | null;
  filledPdfBytes: Uint8Array | null;
  mode: PdfDisplayMode;
  onModeChange: (mode: PdfDisplayMode) => void;
}

export default function PdfViewer({
  originalFile,
  filledPdfBytes,
  mode,
  onModeChange,
}: PdfViewerProps) {
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [filledUrl, setFilledUrl] = useState<string | null>(null);

  // Create object URLs for PDFs
  useEffect(() => {
    if (originalFile) {
      const url = URL.createObjectURL(originalFile);
      setOriginalUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setOriginalUrl(null);
    }
  }, [originalFile]);

  useEffect(() => {
    if (filledPdfBytes) {
      const url = createPdfUrl(filledPdfBytes);
      setFilledUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setFilledUrl(null);
    }
  }, [filledPdfBytes]);

  const currentUrl = mode === 'filled' && filledUrl ? filledUrl : originalUrl;
  const hasFilledPdf = filledPdfBytes !== null;

  const handleDownload = () => {
    if (filledPdfBytes && originalFile) {
      const filename = originalFile.name.replace('.pdf', '_filled.pdf');
      downloadPdf(filledPdfBytes, filename);
    }
  };

  if (!originalFile) {
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
          {/* Toggle buttons */}
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
              onClick={() => hasFilledPdf && onModeChange('filled')}
              disabled={!hasFilledPdf}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                mode === 'filled'
                  ? 'bg-accent text-white'
                  : hasFilledPdf
                  ? 'text-foreground-muted hover:text-foreground-secondary'
                  : 'text-foreground-muted/50 cursor-not-allowed'
              }`}
            >
              Filled
            </button>
          </div>

          {mode === 'filled' && hasFilledPdf && (
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
