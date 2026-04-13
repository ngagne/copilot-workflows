'use client';

import { useState, useRef, useCallback } from 'react';
import styles from './FileDropzone.module.css';

interface FileDropzoneProps {
  maxFiles?: number;
  allowedFileTypes?: string[];
  onFilesChange: (files: File[]) => void;
}

export default function FileDropzone({
  maxFiles = 5,
  allowedFileTypes,
  onFilesChange,
}: FileDropzoneProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateAndSetFiles = useCallback(
    (newFiles: File[]) => {
      const combined = [...files, ...newFiles];

      if (combined.length > maxFiles) {
        setError(`Maximum ${maxFiles} files allowed`);
        return;
      }

      if (allowedFileTypes && allowedFileTypes.length > 0) {
        const invalid = combined.filter((f) => {
          const ext = '.' + f.name.split('.').pop()?.toLowerCase();
          return !allowedFileTypes.includes(ext);
        });
        if (invalid.length > 0) {
          setError(
            `Invalid file types: ${invalid.map((f) => f.name).join(', ')}. Allowed: ${allowedFileTypes.join(', ')}`
          );
          return;
        }
      }

      setError(null);
      setFiles(combined);
      onFilesChange(combined);
    },
    [files, maxFiles, allowedFileTypes, onFilesChange]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const droppedFiles = Array.from(e.dataTransfer.files);
      validateAndSetFiles(droppedFiles);
    },
    [validateAndSetFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = e.target.files ? Array.from(e.target.files) : [];
      validateAndSetFiles(selectedFiles);
      // Reset input so the same file can be selected again
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    },
    [validateAndSetFiles]
  );

  const removeFile = useCallback(
    (index: number) => {
      const updated = files.filter((_, i) => i !== index);
      setFiles(updated);
      onFilesChange(updated);
      setError(null);
    },
    [files, onFilesChange]
  );

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className={styles.container}>
      <div
        className={`${styles.dropzone} ${isDragging ? styles.dragging : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Upload files"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            inputRef.current?.click();
          }
        }}
      >
        <svg
          className={styles.uploadIcon}
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <span className={styles.dropLabel}>
          Drop files here or click to browse
        </span>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        className={styles.hiddenInput}
        onChange={handleInputChange}
        aria-hidden="true"
      />

      {error && <p className={styles.error} role="alert">{error}</p>}

      {files.length > 0 && (
        <div className={styles.fileList}>
          {files.map((file, index) => (
            <div key={index} className={styles.filePill}>
              <span className={styles.fileName}>{file.name}</span>
              <span className={styles.fileSize}>{formatSize(file.size)}</span>
              <button
                type="button"
                className={styles.removeBtn}
                onClick={() => removeFile(index)}
                aria-label={`Remove ${file.name}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
