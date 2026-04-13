import type { WorkflowInput, WorkflowResult, WorkflowEvent } from '@/src/workflows/types';

export async function runWorkflow(
  workflowId: string,
  input: WorkflowInput,
  files: File[],
  handlers: {
    onStatus?: (payload: unknown) => void;
    onProgress?: (payload: unknown) => void;
    onComplete?: (result: WorkflowResult) => void;
    onError?: (message: string) => void;
    onStreamClose?: () => void;
  }
): Promise<void> {
  const formData = new FormData();
  formData.append('prompt', input.prompt);
  files.forEach((f) => formData.append('files', f));

  try {
    const response = await fetch(`/api/workflows/${workflowId}/run`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok || !response.body) {
      handlers.onError?.(`HTTP ${response.status}`);
      handlers.onStreamClose?.();
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const dataLine = line.trim().replace(/^data: /, '');
        if (!dataLine) continue;
        try {
          const event: WorkflowEvent = JSON.parse(dataLine);
          if (event.type === 'status') handlers.onStatus?.(event.payload);
          if (event.type === 'progress') handlers.onProgress?.(event.payload);
          if (event.type === 'complete')
            handlers.onComplete?.((event.payload as { result?: WorkflowResult }).result ?? {});
          if (event.type === 'error')
            handlers.onError?.((event.payload as { message?: string }).message ?? 'Unknown error');
        } catch {
          // malformed event — skip
        }
      }
    }
  } catch (err: unknown) {
    handlers.onError?.(err instanceof Error ? err.message : 'Network error');
  }

  handlers.onStreamClose?.();
}
