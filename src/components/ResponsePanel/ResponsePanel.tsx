'use client';

import { marked } from 'marked';
import styles from './ResponsePanel.module.css';
import type { WorkflowEvent, WorkflowResult } from '@/src/workflows/types';

interface ResponsePanelProps {
  events: WorkflowEvent[];
  isStreaming: boolean;
  onRunAgain: () => void;
}

export default function ResponsePanel({
  events,
  isStreaming,
  onRunAgain,
}: ResponsePanelProps) {
  const statusEvent = events.findLast((e) => e.type === 'status');
  const progressEvent = events.findLast((e) => e.type === 'progress');
  const completeEvent = events.findLast((e) => e.type === 'complete');
  const errorEvent = events.findLast((e) => e.type === 'error');

  const hasResult = completeEvent !== undefined;
  const hasError = errorEvent !== undefined;
  const isDone = hasResult || hasError;

  const renderMarkdown = (content: string) => {
    return <div dangerouslySetInnerHTML={{ __html: marked.parse(content) }} />;
  };

  return (
    <div className={styles.panel}>
      {/* Status bar */}
      {(statusEvent || progressEvent || isStreaming) && (
        <div className={styles.statusBar} aria-live="polite">
          {statusEvent && (
            <span className={styles.statusMessage}>
              {(statusEvent.payload as { message?: string })?.message ?? ''}
            </span>
          )}
          {progressEvent && (
            <span className={styles.progressMessage}>
              {(progressEvent.payload as { step?: string })?.step ?? ''}
            </span>
          )}
          {isStreaming && !isDone && <span className={styles.spinner}>⋯</span>}
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
        <div className={styles.resultArea}>
          {renderMarkdown(
            ((completeEvent!.payload as { result?: WorkflowResult })?.result?.markdown) ?? ''
          )}
        </div>
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
