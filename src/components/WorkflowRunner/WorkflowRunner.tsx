'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { WorkflowManifest, WorkflowEvent, WorkflowInput } from '@/src/workflows/types';
import FileDropzone from '@/src/components/FileDropzone/FileDropzone';
import ResponsePanel from '@/src/components/ResponsePanel/ResponsePanel';
import { runWorkflow } from '@/src/lib/runWorkflow';
import styles from './WorkflowRunner.module.css';

const MAX_PROMPT_HISTORY = 10;
const STORAGE_KEY_PREFIX = 'workflow_prompt_history';

function getStorageKey(workflowId: string): string {
  return `${STORAGE_KEY_PREFIX}:${workflowId}`;
}

function getPromptHistory(workflowId: string): string[] {
  try {
    const raw = localStorage.getItem(getStorageKey(workflowId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePrompt(workflowId: string, prompt: string): void {
  if (!prompt.trim()) return;
  try {
    const history = getPromptHistory(workflowId);
    // Remove duplicate if it already exists
    const deduped = history.filter((p) => p !== prompt);
    // Add to front, keep last MAX_PROMPT_HISTORY
    const updated = [prompt, ...deduped].slice(0, MAX_PROMPT_HISTORY);
    localStorage.setItem(getStorageKey(workflowId), JSON.stringify(updated));
  } catch {
    // localStorage unavailable or full
  }
}

interface WorkflowRunnerProps {
  manifest: WorkflowManifest;
  workflowId: string;
}

export default function WorkflowRunner({ manifest, workflowId }: WorkflowRunnerProps) {
  const [prompt, setPrompt] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [events, setEvents] = useState<WorkflowEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [promptHistory, setPromptHistory] = useState<string[]>(() => getPromptHistory(workflowId));
  const historyRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Close history dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setShowHistory(false);
      }
    }
    if (showHistory) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showHistory]);

  // Refresh history from storage when workflowId changes
  useEffect(() => {
    setPromptHistory(getPromptHistory(workflowId));
  }, [workflowId]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!prompt.trim() || isRunning) return;

      setIsRunning(true);
      setIsStreaming(true);
      setEvents([]);

      const input: WorkflowInput = {
        prompt: prompt.trim(),
        files: [], // Files are uploaded via FormData in runWorkflow
      };

      await runWorkflow(workflowId, input, files, {
        onStatus: (payload) => {
          setEvents((prev) => [...prev, { type: 'status', payload, timestamp: Date.now() }]);
        },
        onProgress: (payload) => {
          setEvents((prev) => [...prev, { type: 'progress', payload, timestamp: Date.now() }]);
        },
        onComplete: (result) => {
          setEvents((prev) => [
            ...prev,
            { type: 'complete', payload: { result }, timestamp: Date.now() },
          ]);
          setIsStreaming(false);
          // Save prompt to history on successful completion
          savePrompt(workflowId, prompt.trim());
          setPromptHistory(getPromptHistory(workflowId));
        },
        onError: (message) => {
          setEvents((prev) => [
            ...prev,
            { type: 'error', payload: { message }, timestamp: Date.now() },
          ]);
          setIsStreaming(false);
        },
        onStreamClose: () => {
          setIsRunning(false);
          setIsStreaming(false);
        },
      });
    },
    [prompt, isRunning, workflowId, files]
  );

  const handleRunAgain = useCallback(() => {
    setEvents([]);
    setPrompt('');
    setFiles([]);
    setIsRunning(false);
    setIsStreaming(false);
  }, []);

  const handleSelectPrompt = useCallback(
    (selectedPrompt: string) => {
      setPrompt(selectedPrompt);
      setShowHistory(false);
      // Focus textarea after selecting
      setTimeout(() => textareaRef.current?.focus(), 0);
    },
    []
  );

  const handleClearHistory = useCallback(() => {
    localStorage.removeItem(getStorageKey(workflowId));
    setPromptHistory([]);
    setShowHistory(false);
  }, [workflowId]);

  const toggleHistory = useCallback(() => {
    setShowHistory((prev) => !prev);
  }, []);

  const hasHistory = promptHistory.length > 0;

  // Truncate long prompts for display
  const truncatePrompt = (text: string, maxLen = 80): string => {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen) + '…';
  };

  return (
    <div className={styles.runner}>
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.field}>
          <div className={styles.labelRow}>
            <label htmlFor="prompt" className={styles.label}>
              Your Prompt
            </label>
            {hasHistory && (
              <div className={styles.historyWrapper} ref={historyRef}>
                <button
                  type="button"
                  className={styles.historyBtn}
                  onClick={toggleHistory}
                  title="Previous prompts"
                >
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
                    <path d="M1.5 8a6.5 6.5 0 1 1 13 0 6.5 6.5 0 0 1-13 0ZM8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0Zm.75 3.75a.75.75 0 0 0-1.5 0v4.5l3.25 1.95a.75.75 0 1 0 .75-1.3L8.75 7.5V3.75Z" />
                  </svg>
                  Recent ({promptHistory.length})
                </button>
                {showHistory && (
                  <div className={styles.historyDropdown}>
                    <div className={styles.historyHeader}>
                      <span>Recent Prompts</span>
                      <button
                        type="button"
                        className={styles.clearBtn}
                        onClick={handleClearHistory}
                        title="Clear history"
                      >
                        Clear all
                      </button>
                    </div>
                    <ul className={styles.historyList}>
                      {promptHistory.map((p, i) => (
                        <li
                          key={i}
                          className={styles.historyItem}
                          onClick={() => handleSelectPrompt(p)}
                          title={p}
                        >
                          {truncatePrompt(p)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
          <textarea
            ref={textareaRef}
            id="prompt"
            className={styles.textarea}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={manifest.promptPlaceholder ?? 'Enter your prompt...'}
            rows={5}
            required
            disabled={isRunning}
          />
        </div>

        {manifest.acceptsFiles && (
          <div className={styles.field}>
            <label className={styles.label}>Attachments (optional)</label>
            <FileDropzone
              maxFiles={manifest.maxFiles ?? 5}
              allowedFileTypes={manifest.allowedFileTypes}
              onFilesChange={setFiles}
            />
          </div>
        )}

        <div className={styles.actions}>
          <button
            type="submit"
            className={styles.btnPrimary}
            disabled={!prompt.trim() || isRunning}
          >
            {isRunning ? (
              <span className={styles.btnWithSpinner}>
                <span className={styles.spinner}>⋯</span>
                Running...
              </span>
            ) : (
              'Run Workflow'
            )}
          </button>
        </div>
      </form>

      {(events.length > 0 || isStreaming) && (
        <ResponsePanel
          events={events}
          isStreaming={isStreaming}
          onRunAgain={handleRunAgain}
        />
      )}
    </div>
  );
}
