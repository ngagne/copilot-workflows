'use client';

import { useState, useCallback } from 'react';
import type { WorkflowManifest, WorkflowEvent, WorkflowInput } from '@/src/workflows/types';
import FileDropzone from '@/src/components/FileDropzone/FileDropzone';
import ResponsePanel from '@/src/components/ResponsePanel/ResponsePanel';
import { runWorkflow } from '@/src/lib/runWorkflow';
import styles from './WorkflowRunner.module.css';

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

  return (
    <div className={styles.runner}>
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.field}>
          <label htmlFor="prompt" className={styles.label}>
            Your Prompt
          </label>
          <textarea
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
