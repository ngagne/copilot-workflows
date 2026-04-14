'use client';

import { useState, useCallback } from 'react';
import { marked } from 'marked';
import styles from './ResponsePanel.module.css';
import type { WorkflowEvent, WorkflowResult } from '@/src/workflows/types';

interface ResponsePanelProps {
  events: WorkflowEvent[];
  isStreaming: boolean;
  onRunAgain: () => void;
}

/**
 * Get the latest activity message from status and progress events.
 * Shows only the most recent event, not both.
 */
function getLatestActivity(events: WorkflowEvent[]): string {
  const statusEvent = events.findLast((e) => e.type === 'status');
  const progressEvent = events.findLast((e) => e.type === 'progress');

  if (!statusEvent && !progressEvent) return '';

  // If both exist, pick the one with the later timestamp
  if (statusEvent && progressEvent) {
    const latest = progressEvent.timestamp > statusEvent.timestamp ? progressEvent : statusEvent;
    const payload = latest.payload as { message?: string; step?: string };
    return payload.message ?? payload.step ?? '';
  }

  if (progressEvent) {
    return (progressEvent.payload as { step?: string })?.step ?? '';
  }

  // statusEvent is definitely defined here
  return (statusEvent!.payload as { message?: string })?.message ?? '';
}

export default function ResponsePanel({
  events,
  isStreaming,
  onRunAgain,
}: ResponsePanelProps) {
  const completeEvent = events.findLast((e) => e.type === 'complete');
  const errorEvent = events.findLast((e) => e.type === 'error');

  const hasResult = completeEvent !== undefined;
  const hasError = errorEvent !== undefined;
  const isDone = hasResult || hasError;

  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!completeEvent) return;
    const result = (completeEvent.payload as { result?: WorkflowResult })?.result;
    const content = result?.markdown ?? '';
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [completeEvent]);

  const renderMarkdown = (content: string) => {
    const html = marked.parse(content) as string;
    return <MarkdownHtml html={html} />;
  };

  const activityMessage = getLatestActivity(events);

  return (
    <div className={styles.panel}>
      {/* Activity indicator */}
      {(!isDone || isStreaming) && (
        <div className={styles.activityIndicator} aria-live="polite">
          <div className={styles.activitySpinner} />
          {activityMessage && (
            <span className={styles.activityText}>{activityMessage}</span>
          )}
        </div>
      )}

      {/* Error state */}
      {hasError && (
        <div className={styles.errorCard} role="alert">
          <p className={styles.errorMessage}>
            {(errorEvent!.payload as { message?: string })?.message ?? 'An unknown error occurred'}
          </p>
        </div>
      )}

      {/* Result area */}
      {hasResult && (
        <>
          <div className={styles.resultArea}>
            {renderMarkdown(
              ((completeEvent!.payload as { result?: WorkflowResult })?.result?.markdown) ?? ''
            )}
          </div>
          <div className={styles.copyRow}>
            <button
              type="button"
              className={styles.copyBtn}
              onClick={handleCopy}
              title={copied ? 'Copied!' : 'Copy response'}
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
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </>
      )}

      {/* Run Again button */}
      {isDone && (
        <div className={styles.actions}>
          <button type="button" className={styles.btnSecondary} onClick={onRunAgain}>
            Run Again
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Renders markdown HTML and post-processes links to make file downloads clickable.
 */
function MarkdownHtml({ html }: { html: string }) {
  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;

      // Post-process: add download attribute to file links
      const links = node.querySelectorAll('a[href]');
      const fileExtPattern = /\.(txt|pdf|zip|js|py|ts|go|java|md|json|csv|xml|html|css|yaml|yml|toml|sh|bash|sql|rb|rs|swift|kt|php|r|scala|lua|pl|ps1|bat|cmd|psm1|psd1|ps1xml|cdxml|clixml|xaml)$/i;

      links.forEach((link) => {
        const href = link.getAttribute('href');
        if (href && fileExtPattern.test(href)) {
          link.setAttribute('download', '');
          link.setAttribute('target', '_blank');
        }
      });
    },
    []
  );

  return <div ref={ref} dangerouslySetInnerHTML={{ __html: html }} />;
}
