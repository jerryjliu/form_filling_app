'use client';

import { useCallback, useState } from 'react';

interface PdfUploadProps {
  onFileSelect: (file: File) => void;
  selectedFile: File | null;
  disabled?: boolean;
}

export default function PdfUpload({ onFileSelect, selectedFile, disabled }: PdfUploadProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;

    const files = e.dataTransfer.files;
    if (files.length && files[0].type === 'application/pdf') {
      onFileSelect(files[0]);
    }
  }, [disabled, onFileSelect]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      onFileSelect(e.target.files[0]);
    }
  }, [onFileSelect]);

  return (
    <div
      className={`
        relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all
        ${isDragging ? 'border-accent bg-accent-light' : 'border-border hover:border-accent/50'}
        ${selectedFile ? 'border-success bg-success/5' : ''}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => !disabled && document.getElementById('pdf-input')?.click()}
    >
      <input
        id="pdf-input"
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={handleFileChange}
        disabled={disabled}
      />

      <div className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-background-tertiary flex items-center justify-center">
          {selectedFile ? (
            <svg className="w-6 h-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-6 h-6 text-foreground-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          )}
        </div>

        {selectedFile ? (
          <>
            <p className="text-sm font-medium text-success">{selectedFile.name}</p>
            <p className="text-xs text-foreground-muted">
              {(selectedFile.size / 1024).toFixed(1)} KB
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-foreground-secondary">
              Drop a PDF here or <span className="text-accent">browse</span>
            </p>
            <p className="text-xs text-foreground-muted">
              Supports fillable PDF forms with AcroForm fields
            </p>
          </>
        )}
      </div>
    </div>
  );
}
