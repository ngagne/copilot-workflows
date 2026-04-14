'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { parseMarkdown } from '@/src/lib/markdown';
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
  const [showDownload, setShowDownload] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const downloadRef = useRef<HTMLDivElement>(null);

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

  // Close download dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (downloadRef.current && !downloadRef.current.contains(e.target as Node)) {
        setShowDownload(false);
      }
    }
    if (showDownload) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDownload]);

  const getMarkdownContent = (): string => {
    if (!completeEvent) return '';
    return (completeEvent.payload as { result?: WorkflowResult })?.result?.markdown ?? '';
  };

  const getRenderedHtml = (): string => {
    const md = getMarkdownContent();
    return parseMarkdown(md);
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
    setShowDownload(false);
    setDownloading(null);
  };

  const downloadMarkdown = () => {
    setDownloading('md');
    const content = getMarkdownContent();
    const blob = new Blob([content], { type: 'text/markdown' });
    setTimeout(() => triggerDownload(blob, 'response.md'), 100);
  };

  const downloadHtml = () => {
    setDownloading('html');
    const bodyHtml = getRenderedHtml();
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

  const downloadWord = () => {
    setDownloading('docx');
    const bodyHtml = getRenderedHtml();
    // Word-compatible HTML with proper UTF-8 encoding headers
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

  const renderMarkdown = (content: string) => {
    const html = parseMarkdown(content);
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
            <div className={styles.downloadWrapper} ref={downloadRef}>
              <button
                type="button"
                className={styles.downloadBtn}
                onClick={() => setShowDownload((prev) => !prev)}
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
              {showDownload && (
                <div className={styles.downloadDropdown}>
                  <div className={styles.downloadHeader}>Download as</div>
                  <ul className={styles.downloadList}>
                    <li
                      className={styles.downloadItem}
                      onClick={downloadMarkdown}
                    >
                      <span className={styles.formatIcon}>MD</span>
                      <span className={styles.formatLabel}>Markdown</span>
                      {downloading === 'md' && <span className={styles.spinner}>⋯</span>}
                    </li>
                    <li
                      className={styles.downloadItem}
                      onClick={downloadHtml}
                    >
                      <span className={styles.formatIcon}>HTML</span>
                      <span className={styles.formatLabel}>HTML (single file)</span>
                      {downloading === 'html' && <span className={styles.spinner}>⋯</span>}
                    </li>
                    <li
                      className={styles.downloadItem}
                      onClick={downloadWord}
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
