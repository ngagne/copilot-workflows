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
  const [showDownload, setShowDownload] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const downloadRef = useRef<HTMLDivElement>(null);
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

  // Close download dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (downloadRef.current && !downloadRef.current.contains(e.target as Node)) {
        setShowDownload(null);
      }
    }
    if (showDownload !== null) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDownload]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!prompt.trim() || isRunning) return;

      const userPrompt = prompt.trim();
      const isFirstPrompt = turns.length === 0;
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
          // Only save prompt to history if it's the first prompt of a conversation
          if (isFirstPrompt) {
            savePrompt(workflowId, userPrompt);
            setPromptHistory(getPromptHistory(workflowId));
          }
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

  const getMarkdownContent = (turn: ChatTurn): string => {
    const completeEvent = turn.events.find((e) => e.type === 'complete');
    if (!completeEvent) return '';
    return (completeEvent.payload as { result?: WorkflowResult })?.result?.markdown ?? '';
  };

  const getRenderedHtml = (turn: ChatTurn): string => {
    const md = getMarkdownContent(turn);
    return marked.parse(md) as string;
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShowDownload(null);
    setDownloading(null);
  };

  const downloadMarkdown = (turnId: string) => {
    setDownloading('md');
    const turn = turns.find((t) => t.id === turnId);
    if (!turn) return;
    const content = getMarkdownContent(turn);
    const blob = new Blob([content], { type: 'text/markdown' });
    setTimeout(() => triggerDownload(blob, 'response.md'), 100);
  };

  const downloadHtml = (turnId: string) => {
    setDownloading('html');
    const turn = turns.find((t) => t.id === turnId);
    if (!turn) return;
    const bodyHtml = getRenderedHtml(turn);
    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Workflow Response</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; line-height: 1.7; color: #1f2328; max-width: 800px; margin: 40px auto; padding: 0 24px; }
  h1, h2, h3, h4, h5, h6 { margin-top: 24px; margin-bottom: 8px; font-weight: 600; }
  h1 { font-size: 24px; } h2 { font-size: 20px; } h3 { font-size: 18px; }
  code { background: #f6f8fa; padding: 2px 6px; border-radius: 6px; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 13px; }
  pre { background: #1f2328; color: #e5e7eb; padding: 16px; border-radius: 8px; overflow-x: auto; }
  pre code { background: none; padding: 0; color: inherit; }
  blockquote { border-left: 3px solid #1456f0; padding-left: 16px; color: #656d76; }
  a { color: #1456f0; }
  img { max-width: 100%; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #d0d7de; padding: 8px 12px; }
  th { background: #f6f8fa; }
  ul, ol { padding-left: 24px; }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
    const blob = new Blob([fullHtml], { type: 'text/html' });
    setTimeout(() => triggerDownload(blob, 'response.html'), 100);
  };

  const downloadWord = (turnId: string) => {
    setDownloading('docx');
    const turn = turns.find((t) => t.id === turnId);
    if (!turn) return;
    const bodyHtml = getRenderedHtml(turn);
    const wordHtml = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta charset="utf-8">
<style>
  body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.6; }
  h1 { font-size: 18pt; font-weight: bold; } h2 { font-size: 15pt; font-weight: bold; } h3 { font-size: 13pt; font-weight: bold; }
  code { font-family: 'Courier New', monospace; background: #f0f0f0; padding: 1px 4px; }
  pre { background: #f0f0f0; padding: 12px; font-family: 'Courier New', monospace; white-space: pre-wrap; }
  blockquote { border-left: 3px solid #1456f0; padding-left: 12px; color: #666; }
  table { border-collapse: collapse; } td, th { border: 1px solid #ccc; padding: 6px; }
  a { color: #1456f0; }
</style>
</head>
<body>${bodyHtml}</body>
</html>`.trim();
    const blob = new Blob([wordHtml], { type: 'application/msword' });
    setTimeout(() => triggerDownload(blob, 'response.doc'), 100);
  };

  const handleCopy = async (turnId: string) => {
    const turn = turns.find((t) => t.id === turnId);
    if (!turn) return;
    const content = getMarkdownContent(turn);
    try {
      await navigator.clipboard.writeText(content);
      setCopied(turnId);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(turnId);
      setTimeout(() => setCopied(null), 2000);
    }
  };

  const hasAnyContent = turns.length > 0 || currentEvents.length > 0;

  return (
    <div className={styles.runner}>
      {/* Chat header with new chat button - only shown after first prompt */}
      {hasAnyContent && (
        <div className={styles.chatHeader}>
          <span className={styles.chatTitle}>Chat</span>
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
        </div>
      )}

      {/* Chat messages area - only shown after first prompt */}
      {hasAnyContent && (
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
                {turn.events.some((e) => e.type === 'complete') && (
                  <div className={styles.copyRow}>
                    <button
                      type="button"
                      className={styles.copyBtn}
                      onClick={() => handleCopy(turn.id)}
                      title={copied === turn.id ? 'Copied!' : 'Copy response'}
                    >
                      <svg
                        className={styles.copyIcon}
                        viewBox="0 0 16 16"
                        width="16"
                        height="16"
                        fill="currentColor"
                      >
                        <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z" />
                        <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z" />
                      </svg>
                      {copied === turn.id ? 'Copied!' : 'Copy'}
                    </button>
                    <div className={styles.downloadWrapper} ref={downloadRef}>
                      <button
                        type="button"
                        className={styles.downloadBtn}
                        onClick={() => setShowDownload(showDownload === turn.id ? null : turn.id)}
                        title="Download response"
                        disabled={downloading !== null}
                      >
                        <svg
                          className={styles.downloadIcon}
                          viewBox="0 0 16 16"
                          width="16"
                          height="16"
                          fill="currentColor"
                        >
                          <path d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14Z" />
                          <path d="M7.25 7.689l-2.722 2.721a.75.75 0 0 1-1.06-1.06L6.5 6.319V2a.75.75 0 0 1 1.5 0v4.319l3.03 3.03a.75.75 0 1 1-1.06 1.06Z" />
                        </svg>
                        Download
                      </button>
                      {showDownload === turn.id && (
                        <div className={styles.downloadDropdown}>
                          <div className={styles.downloadHeader}>Download as</div>
                          <ul className={styles.downloadList}>
                            <li
                              className={styles.downloadItem}
                              onClick={() => downloadMarkdown(turn.id)}
                            >
                              <span className={styles.formatIcon}>MD</span>
                              <span className={styles.formatLabel}>Markdown</span>
                              {downloading === 'md' && <span className={styles.spinner}>⋯</span>}
                            </li>
                            <li
                              className={styles.downloadItem}
                              onClick={() => downloadHtml(turn.id)}
                            >
                              <span className={styles.formatIcon}>HTML</span>
                              <span className={styles.formatLabel}>HTML (single file)</span>
                              {downloading === 'html' && <span className={styles.spinner}>⋯</span>}
                            </li>
                            <li
                              className={styles.downloadItem}
                              onClick={() => downloadWord(turn.id)}
                            >
                              <span className={styles.formatIcon}>W</span>
                              <span className={styles.formatLabel}>Word document</span>
                              {downloading === 'docx' && <span className={styles.spinner}>⋯</span>}
                            </li>
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        <div ref={chatEndRef} />
        </div>
      )}

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
