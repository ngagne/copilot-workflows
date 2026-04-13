import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runWorkflow } from '@/src/lib/runWorkflow';
import type { WorkflowInput, WorkflowResult } from '@/src/workflows/types';

function createMockSSEStream(events: Array<{ type: string; payload: unknown }>) {
  const encoder = new TextEncoder();
  const chunks = events.map((e) => `data: ${JSON.stringify(e)}\n\n`);
  const fullData = chunks.join('');
  const encoded = encoder.encode(fullData);

  let offset = 0;
  const chunkSize = Math.ceil(encoded.length / 2);

  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= encoded.length) {
        controller.close();
        return;
      }
      const end = Math.min(offset + chunkSize, encoded.length);
      controller.enqueue(encoded.slice(offset, end));
      offset = end;
    },
  });
}

describe('runWorkflow SSE Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call onStatus handler for status events', async () => {
    const mockStream = createMockSSEStream([
      { type: 'status', payload: { message: 'Starting...' } },
      { type: 'complete', payload: { result: { markdown: 'Done' } } },
    ]);

    const mockResponse = new Response(mockStream);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const handlers = {
      onStatus: vi.fn(),
      onProgress: vi.fn(),
      onComplete: vi.fn(),
      onError: vi.fn(),
      onStreamClose: vi.fn(),
    };

    const input: WorkflowInput = { prompt: 'Test', files: [] };
    await runWorkflow('test-wf', input, [], handlers);

    expect(handlers.onStatus).toHaveBeenCalledWith({ message: 'Starting...' });
    expect(handlers.onStreamClose).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('should call onProgress handler for progress events', async () => {
    const mockStream = createMockSSEStream([
      { type: 'progress', payload: { step: 'processing' } },
      { type: 'complete', payload: { result: { markdown: 'Done' } } },
    ]);

    const mockResponse = new Response(mockStream);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const handlers = {
      onStatus: vi.fn(),
      onProgress: vi.fn(),
      onComplete: vi.fn(),
      onError: vi.fn(),
      onStreamClose: vi.fn(),
    };

    const input: WorkflowInput = { prompt: 'Test', files: [] };
    await runWorkflow('test-wf', input, [], handlers);

    expect(handlers.onProgress).toHaveBeenCalledWith({ step: 'processing' });

    vi.unstubAllGlobals();
  });

  it('should call onComplete handler for complete events', async () => {
    const resultData: WorkflowResult = { markdown: '## Result\n\nDone' };
    const mockStream = createMockSSEStream([
      { type: 'complete', payload: { result: resultData } },
    ]);

    const mockResponse = new Response(mockStream);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const handlers = {
      onStatus: vi.fn(),
      onProgress: vi.fn(),
      onComplete: vi.fn(),
      onError: vi.fn(),
      onStreamClose: vi.fn(),
    };

    const input: WorkflowInput = { prompt: 'Test', files: [] };
    await runWorkflow('test-wf', input, [], handlers);

    expect(handlers.onComplete).toHaveBeenCalledWith(resultData);

    vi.unstubAllGlobals();
  });

  it('should call onError handler for error events', async () => {
    const mockStream = createMockSSEStream([
      { type: 'error', payload: { message: 'Something went wrong' } },
    ]);

    const mockResponse = new Response(mockStream);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const handlers = {
      onStatus: vi.fn(),
      onProgress: vi.fn(),
      onComplete: vi.fn(),
      onError: vi.fn(),
      onStreamClose: vi.fn(),
    };

    const input: WorkflowInput = { prompt: 'Test', files: [] };
    await runWorkflow('test-wf', input, [], handlers);

    expect(handlers.onError).toHaveBeenCalledWith('Something went wrong');

    vi.unstubAllGlobals();
  });

  it('should call onError for HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })));

    const handlers = {
      onError: vi.fn(),
      onStreamClose: vi.fn(),
    };

    const input: WorkflowInput = { prompt: 'Test', files: [] };
    await runWorkflow('test-wf', input, [], handlers);

    expect(handlers.onError).toHaveBeenCalledWith('HTTP 500');

    vi.unstubAllGlobals();
  });

  it('should send files in FormData', async () => {
    let capturedBody: FormData | null = null;
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, opts: RequestInit) => {
      capturedBody = opts.body as FormData;
      const mockStream = createMockSSEStream([
        { type: 'complete', payload: { result: {} } },
      ]);
      return Promise.resolve(new Response(mockStream));
    }));

    const file = new File(['content'], 'test.ts', { type: 'text/typescript' });
    const handlers = { onComplete: vi.fn() };
    const input: WorkflowInput = { prompt: 'Hello', files: [] };

    await runWorkflow('test-wf', input, [file], handlers);

    expect(capturedBody).toBeInstanceOf(FormData);
    expect(capturedBody!.get('prompt')).toBe('Hello');
    expect(capturedBody!.getAll('files')).toHaveLength(1);

    vi.unstubAllGlobals();
  });
});
