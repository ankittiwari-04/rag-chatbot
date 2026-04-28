'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileText, X, CheckCircle, AlertCircle, Loader2, FolderUp } from 'lucide-react';
import { uploadFiles } from '@/lib/api';
import type { UploadedFile } from '@/types';

interface FileUploaderProps {
  onUploadComplete?: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileUploader({ onUploadComplete }: FileUploaderProps) {
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback((accepted: File[]) => {
    setError(null);
    setPendingFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      return [...prev, ...accepted.filter((f) => !names.has(f.name))];
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
    },
    maxFiles: 5,
    maxSize: 10 * 1024 * 1024,
    onDropRejected: (rejections) => {
      const msgs = rejections
        .map((r) => r.errors.map((e) => e.message).join(', '))
        .join('; ');
      setError(msgs);
    },
  });

  const removeFile = (name: string) => {
    setPendingFiles((prev) => prev.filter((f) => f.name !== name));
  };

  const handleUpload = async () => {
    if (pendingFiles.length === 0 || isUploading) return;
    setIsUploading(true);
    setProgress(0);
    setError(null);

    // Optimistic file statuses
    const statuses: UploadedFile[] = pendingFiles.map((f) => ({
      name: f.name,
      size: f.size,
      status: 'uploading',
    }));
    setUploadedFiles((prev) => [...prev, ...statuses]);

    try {
      await uploadFiles(pendingFiles, (pct) => setProgress(pct));

      setUploadedFiles((prev) =>
        prev.map((f) =>
          statuses.find((s) => s.name === f.name) ? { ...f, status: 'success' } : f,
        ),
      );
      setPendingFiles([]);
      onUploadComplete?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed.';
      setError(msg);
      setUploadedFiles((prev) =>
        prev.map((f) =>
          statuses.find((s) => s.name === f.name)
            ? { ...f, status: 'error', error: msg }
            : f,
        ),
      );
    } finally {
      setIsUploading(false);
      setProgress(0);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Drop zone */}
      <div
        {...getRootProps()}
        className="relative rounded-xl p-4 cursor-pointer transition-all duration-200 select-none"
        style={{
          border: `2px dashed ${isDragActive ? '#6366f1' : '#2a2a2a'}`,
          background: isDragActive ? 'rgba(99,102,241,0.06)' : '#0f0f0f',
          transform: isDragActive ? 'scale(1.01)' : 'scale(1)',
          boxShadow: isDragActive ? '0 0 20px rgba(99,102,241,0.15)' : 'none',
        }}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-2 text-center">
          <motion.div
            animate={{ y: isDragActive ? -4 : 0 }}
            transition={{ duration: 0.2 }}
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(99,102,241,0.1)' }}
          >
            {isDragActive ? (
              <FolderUp size={20} color="#6366f1" />
            ) : (
              <Upload size={20} color="#6366f1" />
            )}
          </motion.div>

          <div>
            <p className="text-sm font-medium" style={{ color: '#f5f5f5' }}>
              {isDragActive ? 'Drop files here' : 'Drag & drop files'}
            </p>
            <p className="text-xs mt-0.5" style={{ color: '#525252' }}>
              PDF, TXT, MD — up to 5 files, 10 MB each
            </p>
          </div>

          {!isDragActive && (
            <span
              className="text-xs px-3 py-1 rounded-full font-medium"
              style={{ background: 'rgba(99,102,241,0.12)', color: '#6366f1' }}
            >
              Browse files
            </span>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs flex items-center gap-1.5" style={{ color: '#ef4444' }}>
          <AlertCircle size={12} />
          {error}
        </p>
      )}

      {/* Pending file list */}
      <AnimatePresence>
        {pendingFiles.map((file) => (
          <motion.div
            key={file.name}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2 rounded-lg px-3 py-2"
            style={{ background: '#111111', border: '1px solid #1f1f1f' }}
          >
            <FileText size={14} color="#6366f1" className="flex-shrink-0" />
            <span className="text-xs flex-1 truncate" style={{ color: '#f5f5f5' }}>
              {file.name}
            </span>
            <span className="text-xs" style={{ color: '#525252' }}>
              {formatFileSize(file.size)}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); removeFile(file.name); }}
              className="ml-1 p-0.5 rounded hover:opacity-70 transition-opacity"
              style={{ color: '#525252' }}
            >
              <X size={12} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Upload progress bar */}
      {isUploading && (
        <div className="space-y-1">
          <div
            className="h-1.5 rounded-full overflow-hidden"
            style={{ background: '#1f1f1f' }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{ background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <p className="text-xs text-right" style={{ color: '#525252' }}>
            {progress}%
          </p>
        </div>
      )}

      {/* Upload button */}
      {pendingFiles.length > 0 && (
        <button
          onClick={handleUpload}
          disabled={isUploading}
          className="w-full py-2 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          style={{
            background: isUploading
              ? 'rgba(99,102,241,0.5)'
              : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
            color: '#ffffff',
          }}
        >
          {isUploading ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Ingesting...
            </>
          ) : (
            <>
              <Upload size={14} />
              Upload & Ingest ({pendingFiles.length})
            </>
          )}
        </button>
      )}

      {/* Previously uploaded files */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-1.5 mt-1">
          <p className="text-xs font-medium" style={{ color: '#525252' }}>
            Ingested files
          </p>
          {uploadedFiles.slice(-8).map((f, i) => (
            <div
              key={`${f.name}-${i}`}
              className="flex items-center gap-2 rounded-lg px-3 py-1.5"
              style={{ background: '#0f0f0f', border: '1px solid #1a1a1a' }}
            >
              {f.status === 'uploading' && (
                <Loader2 size={12} color="#6366f1" className="animate-spin flex-shrink-0" />
              )}
              {f.status === 'success' && (
                <CheckCircle size={12} color="#22c55e" className="flex-shrink-0" />
              )}
              {f.status === 'error' && (
                <AlertCircle size={12} color="#ef4444" className="flex-shrink-0" />
              )}
              <span
                className="text-xs flex-1 truncate"
                style={{ color: f.status === 'error' ? '#ef4444' : '#a3a3a3' }}
                title={f.error ?? f.name}
              >
                {f.name}
              </span>
              <span className="text-xs" style={{ color: '#525252' }}>
                {formatFileSize(f.size)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
