'use client';

import { useCallback, useState } from 'react';

export interface ContextFile {
  filename: string;
  content: string;
  was_parsed: boolean;
}

export interface ParseProgress {
  current: number;
  total: number;
  filename: string;
  status: 'parsing' | 'reading_text' | 'llamaparse' | 'complete' | 'error';
  error?: string;
}

interface ContextFilesUploadProps {
  files: ContextFile[];
  onFilesChange: (files: ContextFile[]) => void;
  onParseFiles: (files: File[], parseMode: 'cost_effective' | 'agentic_plus') => Promise<void>;
  isUploading: boolean;
  parseProgress: ParseProgress | null;
  disabled?: boolean;
  maxFiles?: number;
}

export default function ContextFilesUpload({
  files,
  onFilesChange,
  onParseFiles,
  isUploading,
  parseProgress,
  disabled,
  maxFiles = 5,
}: ContextFilesUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [parseMode, setParseMode] = useState<'cost_effective' | 'agentic_plus'>('cost_effective');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled && !isUploading) setIsDragging(true);
  }, [disabled, isUploading]);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled || isUploading) return;

    const droppedFiles = Array.from(e.dataTransfer.files);
    const currentCount = files.length + pendingFiles.length;
    const remainingSlots = maxFiles - currentCount;

    if (remainingSlots <= 0) return;

    const newFiles = droppedFiles.slice(0, remainingSlots);
    setPendingFiles(prev => [...prev, ...newFiles]);
  }, [disabled, isUploading, files.length, pendingFiles.length, maxFiles]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;

    const selectedFiles = Array.from(e.target.files);
    const currentCount = files.length + pendingFiles.length;
    const remainingSlots = maxFiles - currentCount;

    if (remainingSlots <= 0) return;

    const newFiles = selectedFiles.slice(0, remainingSlots);
    setPendingFiles(prev => [...prev, ...newFiles]);

    // Reset the input
    e.target.value = '';
  }, [files.length, pendingFiles.length, maxFiles]);

  const handleRemovePending = useCallback((index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleRemoveUploaded = useCallback((index: number) => {
    onFilesChange(files.filter((_, i) => i !== index));
  }, [files, onFilesChange]);

  const handleUpload = useCallback(async () => {
    if (pendingFiles.length === 0 || isUploading) return;

    await onParseFiles(pendingFiles, parseMode);
    setPendingFiles([]);
  }, [pendingFiles, parseMode, isUploading, onParseFiles]);

  const totalCount = files.length + pendingFiles.length;
  const canAddMore = totalCount < maxFiles;

  return (
    <div className="space-y-3">
      {/* Header with toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-foreground-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-xs font-medium text-foreground-secondary">
            Context Files ({totalCount}/{maxFiles})
          </span>
        </div>

        {/* Parse mode toggle */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-foreground-muted">Mode:</span>
          <select
            value={parseMode}
            onChange={(e) => setParseMode(e.target.value as 'cost_effective' | 'agentic_plus')}
            disabled={disabled || isUploading}
            className="text-xs px-2 py-1 rounded bg-background-tertiary border border-border text-foreground disabled:opacity-50"
          >
            <option value="cost_effective">Cost Effective</option>
            <option value="agentic_plus">Agentic Plus</option>
          </select>
        </div>
      </div>

      {/* Drop zone - only show if can add more */}
      {canAddMore && (
        <div
          className={`
            relative border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all
            ${isDragging ? 'border-accent bg-accent-light' : 'border-border hover:border-accent/50'}
            ${disabled || isUploading ? 'opacity-50 cursor-not-allowed' : ''}
          `}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !disabled && !isUploading && document.getElementById('context-files-input')?.click()}
        >
          <input
            id="context-files-input"
            type="file"
            multiple
            accept=".pdf,.pptx,.ppt,.docx,.doc,.xlsx,.xls,.png,.jpg,.jpeg,.gif,.txt,.md,.csv,.json,.xml,.html"
            className="hidden"
            onChange={handleFileChange}
            disabled={disabled || isUploading}
          />

          <div className="flex flex-col items-center gap-2">
            <svg className="w-8 h-8 text-foreground-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-xs text-foreground-secondary">
              Drop files or <span className="text-accent">browse</span>
            </p>
            <p className="text-xs text-foreground-muted">
              PDF, PPTX, DOCX, images, or text files
            </p>
          </div>
        </div>
      )}

      {/* Pending files list */}
      {pendingFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-foreground-muted">Ready to upload:</p>
          <div className="space-y-1">
            {pendingFiles.map((file, index) => (
              <div
                key={`pending-${index}`}
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-background-tertiary"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileIcon filename={file.name} />
                  <span className="text-xs text-foreground-secondary truncate">{file.name}</span>
                  <span className="text-xs text-foreground-muted">
                    ({(file.size / 1024).toFixed(1)} KB)
                  </span>
                </div>
                <button
                  onClick={() => handleRemovePending(index)}
                  disabled={isUploading}
                  className="p-1 hover:bg-border rounded transition-colors disabled:opacity-50"
                >
                  <svg className="w-3 h-3 text-foreground-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          {/* Upload button */}
          <button
            onClick={handleUpload}
            disabled={isUploading || disabled}
            className="w-full px-4 py-2 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isUploading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {parseProgress ? `Parsing ${parseProgress.filename}...` : 'Uploading...'}
              </span>
            ) : (
              `Upload & Parse ${pendingFiles.length} file${pendingFiles.length > 1 ? 's' : ''}`
            )}
          </button>
        </div>
      )}

      {/* Parse progress */}
      {isUploading && parseProgress && (
        <div className="px-3 py-2 rounded-lg bg-accent/10 text-accent">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs">
              {parseProgress.status === 'llamaparse' ? 'Parsing with LlamaParse' :
               parseProgress.status === 'reading_text' ? 'Reading text file' :
               parseProgress.status === 'complete' ? 'Complete' :
               parseProgress.status === 'error' ? 'Error' : 'Processing'}
            </span>
            <span className="text-xs">{parseProgress.current}/{parseProgress.total}</span>
          </div>
          <div className="w-full h-1 bg-accent/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-300"
              style={{ width: `${(parseProgress.current / parseProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Uploaded files list */}
      {files.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-foreground-muted">Uploaded:</p>
          {files.map((file, index) => (
            <div
              key={`uploaded-${index}`}
              className="flex items-center justify-between px-3 py-2 rounded-lg bg-success/10"
            >
              <div className="flex items-center gap-2 min-w-0">
                <svg className="w-4 h-4 text-success flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-xs text-foreground-secondary truncate">{file.filename}</span>
                {file.was_parsed && (
                  <span className="text-xs text-foreground-muted">(parsed)</span>
                )}
              </div>
              <button
                onClick={() => handleRemoveUploaded(index)}
                disabled={isUploading}
                className="p-1 hover:bg-border rounded transition-colors disabled:opacity-50"
              >
                <svg className="w-3 h-3 text-foreground-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Helper component for file type icons
function FileIcon({ filename }: { filename: string }) {
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  const isPdf = ext === 'pdf';
  const isDoc = ['doc', 'docx'].includes(ext);
  const isPpt = ['ppt', 'pptx'].includes(ext);
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext);
  const isText = ['txt', 'md', 'csv', 'json', 'xml', 'html'].includes(ext);

  if (isPdf) {
    return <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
    </svg>;
  }

  if (isDoc) {
    return <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
    </svg>;
  }

  if (isPpt) {
    return <svg className="w-4 h-4 text-orange-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
    </svg>;
  }

  if (isImage) {
    return <svg className="w-4 h-4 text-purple-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
    </svg>;
  }

  if (isText) {
    return <svg className="w-4 h-4 text-gray-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
    </svg>;
  }

  return <svg className="w-4 h-4 text-foreground-muted flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
  </svg>;
}
