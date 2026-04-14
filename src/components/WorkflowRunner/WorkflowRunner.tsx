'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { marked } from 'marked';
import type { WorkflowManifest, WorkflowEvent, WorkflowInput, WorkflowResult } from '@/src/workflows/types';
import FileDropzone from '@/src/components/FileDropzone/FileDropzone';
import { runWorkflow } from '@/src/lib/runWorkflow';
import styles from './WorkflowRunner.module.css';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface ChatTurn {
  id: string;
  userPrompt: string;
  events: WorkflowEvent[];
  isStreaming: boolean;
  timestamp: number;
}

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
    const deduped = history.filter((p) => p !== prompt);
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
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentEvents, setCurrentEvents] = useState<WorkflowEvent[]>([]);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [promptHistory, setPromptHistory] = useState<string[]>([]);
  const historyRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  // Load history from storage on mount
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      setPromptHistory(getPromptHistory(workflowId));
    }
  }, [workflowId]);

  // Auto-scroll to bottom when new content appears
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, currentEvents, isStreaming]);

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

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!prompt.trim() || isRunning) return;

      const userPrompt = prompt.trim();
      setIsRunning(true);
      setIsStreaming(true);
      setCurrentEvents([]);

      // Collect conversation history from completed turns
      const conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
      for (const turn of turns) {
        conversationHistory.push({ role: 'user', content: turn.userPrompt });
        const completeEvent = turn.events.find((ev) => ev.type === 'complete');
        if (completeEvent) {
          const result = (completeEvent.payload as { result?: WorkflowResult })?.result;
          if (result?.markdown) {
            conversationHistory.push({ role: 'assistant', content: result.markdown });
          }
        }
      }

      // Create a new turn
      const turnId = `turn-${Date.now()}`;
      setTurns((prev) => [
        ...prev,
        { id: turnId, userPrompt, events: [], isStreaming: true, timestamp: Date.now() },
      ]);
      setPrompt('');
      setFiles([]);

      const input: WorkflowInput = {
        prompt: userPrompt,
        files: [],
        conversationHistory,
      };

      await runWorkflow(workflowId, input, files, {
        onStatus: (payload) => {
          setCurrentEvents((prev) => [
            ...prev,
            { type: 'status', payload, timestamp: Date.now() },
          ]);
          // Also push to the current turn
          setTurns((prev) =>
            prev.map((t) =>
              t.isStreaming
                ? {
                    ...t,
                    events: [...t.events, { type: 'status' as const, payload, timestamp: Date.now() }],
                  }
                : t
            )
          );
        },
        onProgress: (payload) => {
          setCurrentEvents((prev) => [
            ...prev,
            { type: 'progress', payload, timestamp: Date.now() },
          ]);
          setTurns((prev) =>
            prev.map((t) =>
              t.isStreaming
                ? {
                    ...t,
                    events: [
                      ...t.events,
                      { type: 'progress' as const, payload, timestamp: Date.now() },
                    ],
                  }
                : t
            )
          );
        },
        onComplete: (result) => {
          const completeEvent: WorkflowEvent = {
            type: 'complete',
            payload: { result },
            timestamp: Date.now(),
          };
          setCurrentEvents((prev) => [...prev, completeEvent]);
          setIsStreaming(false);
          setTurns((prev) =>
            prev.map((t) =>
              t.isStreaming
                ? {
                    ...t,
                    events: [...t.events, completeEvent],
                    isStreaming: false,
                  }
                : t
            )
          );
          savePrompt(workflowId, userPrompt);
          setPromptHistory(getPromptHistory(workflowId));
        },
        onError: (message) => {
          const errorEvent: WorkflowEvent = {
            type: 'error',
            payload: { message },
            timestamp: Date.now(),
          };
          setCurrentEvents((prev) => [...prev, errorEvent]);
          setIsStreaming(false);
          setTurns((prev) =>
            prev.map((t) =>
              t.isStreaming
                ? { ...t, events: [...t.events, errorEvent], isStreaming: false }
                : t
            )
          );
        },
        onStreamClose: () => {
          setIsRunning(false);
          setIsStreaming(false);
          setTurns((prev) =>
            prev.map((t) => (t.isStreaming ? { ...t, isStreaming: false } : t))
          );
        },
      }, conversationHistory);
    },
    [prompt, isRunning, workflowId, files]
  );

  const handleNewChat = useCallback(() => {
    setTurns([]);
    setCurrentEvents([]);
    setPrompt('');
    setFiles([]);
    setIsRunning(false);
    setIsStreaming(false);
  }, []);

  const handleSelectPrompt = useCallback((selectedPrompt: string) => {
    setPrompt(selectedPrompt);
    setShowHistory(false);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, []);

  const handleClearHistory = useCallback(() => {
    localStorage.removeItem(getStorageKey(workflowId));
    setPromptHistory([]);
    setShowHistory(false);
  }, [workflowId]);

  const toggleHistory = useCallback(() => {
    setShowHistory((prev) => !prev);
  }, []);

  const hasHistory = promptHistory.length > 0;
  const truncatePrompt = (text: string, maxLen = 80): string => {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen) + '…';
  };

  // Get the latest activity for the streaming indicator
  const getLatestActivity = (events: WorkflowEvent[]): string => {
    const statusEvent = events.findLast((e) => e.type === 'status');
    const progressEvent = events.findLast((e) => e.type === 'progress');
    if (!statusEvent && !progressEvent) return '';
    if (statusEvent && progressEvent) {
      const latest = progressEvent.timestamp > statusEvent.timestamp ? progressEvent : statusEvent;
      const payload = latest.payload as { message?: string; step?: string };
      return payload.message ?? payload.step ?? '';
    }
    if (progressEvent) {
      return (progressEvent.payload as { step?: string })?.step ?? '';
    }
    return (statusEvent!.payload as { message?: string })?.message ?? '';
  };

  const renderMarkdown = (content: string) => {
    const html = marked.parse(content) as string;
    return <div dangerouslySetInnerHTML={{ __html: html }} />;
  };

  const hasAnyContent = turns.length > 0 || currentEvents.length > 0;

  return (
    <div className={styles.runner}>
      {/* Chat header with new chat button */}
      <div className={styles.chatHeader}>
        <span className={styles.chatTitle}>Chat</span>
        {hasAnyContent && (
          <button
            type="button"
            className={styles.newChatBtn}
            onClick={handleNewChat}
            title="Start new chat"
          >
            <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
              <path d="M11.013 2.513a1.75 1.75 0 0 1 2.475 2.474L6.226 12.25a2.751 2.751 0 0 1-.892.596l-2.047.848a.75.75 0 0 1-.98-.98l.848-2.047a2.75 2.75 0 0 1 .596-.892l7.262-7.261Z" />
            </svg>
            New Chat
          </button>
        )}
      </div>

      {/* Chat messages area */}
      <div className={styles.chatArea}>
        {turns.map((turn) => (
          <div key={turn.id} className={styles.turnContainer}>
            {/* User message - right aligned */}
            <div className={styles.userMessage}>
              {renderMarkdown(turn.userPrompt)}
            </div>

            {/* Assistant response or loading */}
            {turn.isStreaming && (
              <div className={styles.assistantMessage}>
                <div className={styles.activityIndicator}>
                  <div className={styles.activitySpinner} />
                  <span className={styles.activityText}>
                    {getLatestActivity(turn.events) || 'Thinking...'}
                  </span>
                </div>
              </div>
            )}
            {!turn.isStreaming && (
              <div className={styles.assistantMessage}>
                {turn.events
                  .filter((e) => e.type === 'complete')
                  .map((e, i) => {
                    const result = (e.payload as { result?: WorkflowResult })?.result;
                    return result?.markdown ? (
                      <div key={i}>{renderMarkdown(result.markdown)}</div>
                    ) : null;
                  })}
                {turn.events
                  .filter((e) => e.type === 'error')
                  .map((e, i) => (
                    <div key={i} className={styles.errorCard}>
                      <p className={styles.errorMessage}>
                        {(e.payload as { message?: string })?.message ?? 'An unknown error occurred'}
                      </p>
                    </div>
                  ))}
              </div>
            )}
          </div>
        ))}

        <div ref={chatEndRef} />
      </div>

      {/* Input form */}
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
            rows={3}
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
              'Send'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
