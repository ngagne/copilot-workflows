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
    jest.clearAllMocks();
  });

  it('should call onStatus handler for status events', async () => {
    const mockStream = createMockSSEStream([
      { type: 'status', payload: { message: 'Starting...' } },
      { type: 'complete', payload: { result: { markdown: 'Done' } } },
    ]);

    const mockResponse = new Response(mockStream);
    const mockFetch = jest.fn().mockResolvedValue(mockResponse);
    globalThis.fetch = mockFetch;

    const handlers = {
      onStatus: jest.fn(),
      onProgress: jest.fn(),
      onComplete: jest.fn(),
      onError: jest.fn(),
      onStreamClose: jest.fn(),
    };

    const input: WorkflowInput = { prompt: 'Test', files: [] };
    await runWorkflow('test-wf', input, [], handlers);

    expect(handlers.onStatus).toHaveBeenCalledWith({ message: 'Starting...' });
    expect(handlers.onStreamClose).toHaveBeenCalled();
  });

  it('should call onProgress handler for progress events', async () => {
    const mockStream = createMockSSEStream([
      { type: 'progress', payload: { step: 'processing' } },
      { type: 'complete', payload: { result: { markdown: 'Done' } } },
    ]);

    const mockResponse = new Response(mockStream);
    const mockFetch = jest.fn().mockResolvedValue(mockResponse);
    globalThis.fetch = mockFetch;

    const handlers = {
      onStatus: jest.fn(),
      onProgress: jest.fn(),
      onComplete: jest.fn(),
      onError: jest.fn(),
      onStreamClose: jest.fn(),
    };

    const input: WorkflowInput = { prompt: 'Test', files: [] };
    await runWorkflow('test-wf', input, [], handlers);

    expect(handlers.onProgress).toHaveBeenCalledWith({ step: 'processing' });
  });

  it('should call onComplete handler for complete events', async () => {
    const resultData: WorkflowResult = { markdown: '## Result\n\nDone' };
    const mockStream = createMockSSEStream([
      { type: 'complete', payload: { result: resultData } },
    ]);

    const mockResponse = new Response(mockStream);
    const mockFetch = jest.fn().mockResolvedValue(mockResponse);
    globalThis.fetch = mockFetch;

    const handlers = {
      onStatus: jest.fn(),
      onProgress: jest.fn(),
      onComplete: jest.fn(),
      onError: jest.fn(),
      onStreamClose: jest.fn(),
    };

    const input: WorkflowInput = { prompt: 'Test', files: [] };
    await runWorkflow('test-wf', input, [], handlers);

    expect(handlers.onComplete).toHaveBeenCalledWith(resultData);
  });

  it('should call onError handler for error events', async () => {
    const mockStream = createMockSSEStream([
      { type: 'error', payload: { message: 'Something went wrong' } },
    ]);

    const mockResponse = new Response(mockStream);
    const mockFetch = jest.fn().mockResolvedValue(mockResponse);
    globalThis.fetch = mockFetch;

    const handlers = {
      onStatus: jest.fn(),
      onProgress: jest.fn(),
      onComplete: jest.fn(),
      onError: jest.fn(),
      onStreamClose: jest.fn(),
    };

    const input: WorkflowInput = { prompt: 'Test', files: [] };
    await runWorkflow('test-wf', input, [], handlers);

    expect(handlers.onError).toHaveBeenCalledWith('Something went wrong');
  });

  it('should call onError for HTTP errors', async () => {
    const mockFetch = jest.fn().mockResolvedValue(new Response(null, { status: 500 }));
    globalThis.fetch = mockFetch;

    const handlers = {
      onError: jest.fn(),
      onStreamClose: jest.fn(),
    };

    const input: WorkflowInput = { prompt: 'Test', files: [] };
    await runWorkflow('test-wf', input, [], handlers);

    expect(handlers.onError).toHaveBeenCalledWith('HTTP 500');
  });

  it('should send files in FormData', async () => {
    let capturedBody: FormData | null = null;
    const mockFetch = jest.fn().mockImplementation((_url: string, opts: RequestInit) => {
      capturedBody = opts.body as FormData;
      const mockStream = createMockSSEStream([
        { type: 'complete', payload: { result: {} } },
      ]);
      return Promise.resolve(new Response(mockStream));
    });
    globalThis.fetch = mockFetch;

    const file = new File(['content'], 'test.ts', { type: 'text/typescript' });
    const handlers = { onComplete: jest.fn() };
    const input: WorkflowInput = { prompt: 'Hello', files: [] };

    await runWorkflow('test-wf', input, [file], handlers);

    expect(capturedBody).toBeInstanceOf(FormData);
    expect(capturedBody!.get('prompt')).toBe('Hello');
    expect(capturedBody!.getAll('files')).toHaveLength(1);
  });

  it('should send conversationHistory in FormData when provided', async () => {
    let capturedBody: FormData | null = null;
    const mockFetch = jest.fn().mockImplementation((_url: string, opts: RequestInit) => {
      capturedBody = opts.body as FormData;
      const mockStream = createMockSSEStream([
        { type: 'complete', payload: { result: { markdown: 'Done' } } },
      ]);
      return Promise.resolve(new Response(mockStream));
    });
    globalThis.fetch = mockFetch;

    const handlers = { onComplete: jest.fn() };
    const input: WorkflowInput = { prompt: 'Hello', files: [] };
    const conversationHistory = [
      { role: 'user' as const, content: 'Hi' },
      { role: 'assistant' as const, content: 'Hello!' },
    ];

    await runWorkflow('test-wf', input, [], handlers, conversationHistory);

    expect(capturedBody).toBeInstanceOf(FormData);
    expect(capturedBody!.get('conversationHistory')).toBe(JSON.stringify(conversationHistory));
  });

  it('should not send conversationHistory when empty', async () => {
    let capturedBody: FormData | null = null;
    const mockFetch = jest.fn().mockImplementation((_url: string, opts: RequestInit) => {
      capturedBody = opts.body as FormData;
      const mockStream = createMockSSEStream([
        { type: 'complete', payload: { result: {} } },
      ]);
      return Promise.resolve(new Response(mockStream));
    });
    globalThis.fetch = mockFetch;

    const handlers = { onComplete: jest.fn() };
    const input: WorkflowInput = { prompt: 'Hello', files: [] };

    await runWorkflow('test-wf', input, [], handlers, []);

    expect(capturedBody).toBeInstanceOf(FormData);
    expect(capturedBody!.get('conversationHistory')).toBeNull();
  });

  it('should call onError and onStreamClose when response body is null', async () => {
    const mockFetch = jest.fn().mockResolvedValue(new Response(null, { status: 200 }));
    globalThis.fetch = mockFetch;

    const handlers = {
      onError: jest.fn(),
      onStreamClose: jest.fn(),
    };

    const input: WorkflowInput = { prompt: 'Test', files: [] };
    await runWorkflow('test-wf', input, [], handlers);

    expect(handlers.onError).toHaveBeenCalledWith('HTTP 200');
    expect(handlers.onStreamClose).toHaveBeenCalled();
  });

  it('should call onError for network errors', async () => {
    const mockFetch = jest.fn().mockRejectedValue(new Error('Network timeout'));
    globalThis.fetch = mockFetch;

    const handlers = {
      onError: jest.fn(),
      onStreamClose: jest.fn(),
    };

    const input: WorkflowInput = { prompt: 'Test', files: [] };
    await runWorkflow('test-wf', input, [], handlers);

    expect(handlers.onError).toHaveBeenCalledWith('Network timeout');
    expect(handlers.onStreamClose).toHaveBeenCalled();
  });

  it('should call onError with generic message for non-Error exceptions', async () => {
    const mockFetch = jest.fn().mockRejectedValue('String error');
    globalThis.fetch = mockFetch;

    const handlers = {
      onError: jest.fn(),
      onStreamClose: jest.fn(),
    };

    const input: WorkflowInput = { prompt: 'Test', files: [] };
    await runWorkflow('test-wf', input, [], handlers);

    expect(handlers.onError).toHaveBeenCalledWith('Network error');
    expect(handlers.onStreamClose).toHaveBeenCalled();
  });

  it('should handle malformed SSE data gracefully', async () => {
    const encoder = new TextEncoder();
    const malformedData = 'data: not valid json\n\n';
    const encoded = encoder.encode(malformedData);

    const mockStream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(encoded);
        controller.close();
      },
    });

    const mockResponse = new Response(mockStream);
    const mockFetch = jest.fn().mockResolvedValue(mockResponse);
    globalThis.fetch = mockFetch;

    const handlers = {
      onComplete: jest.fn(),
      onStreamClose: jest.fn(),
    };

    const input: WorkflowInput = { prompt: 'Test', files: [] };
    await runWorkflow('test-wf', input, [], handlers);

    // Should not throw, should just close stream
    expect(handlers.onStreamClose).toHaveBeenCalled();
  });

  it('should handle empty SSE lines gracefully', async () => {
    const encoder = new TextEncoder();
    const emptyLines = 'data: \n\n\n\n';
    const encoded = encoder.encode(emptyLines);

    const mockStream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(encoded);
        controller.close();
      },
    });

    const mockResponse = new Response(mockStream);
    const mockFetch = jest.fn().mockResolvedValue(mockResponse);
    globalThis.fetch = mockFetch;

    const handlers = {
      onComplete: jest.fn(),
      onStreamClose: jest.fn(),
    };

    const input: WorkflowInput = { prompt: 'Test', files: [] };
    await runWorkflow('test-wf', input, [], handlers);

    expect(handlers.onStreamClose).toHaveBeenCalled();
  });

  it('should handle complete event with missing result gracefully', async () => {
    const mockStream = createMockSSEStream([
      { type: 'complete', payload: {} },
    ]);

    const mockResponse = new Response(mockStream);
    const mockFetch = jest.fn().mockResolvedValue(mockResponse);
    globalThis.fetch = mockFetch;

    const handlers = {
      onComplete: jest.fn(),
      onStreamClose: jest.fn(),
    };

    const input: WorkflowInput = { prompt: 'Test', files: [] };
    await runWorkflow('test-wf', input, [], handlers);

    expect(handlers.onComplete).toHaveBeenCalledWith({});
    expect(handlers.onStreamClose).toHaveBeenCalled();
  });

  it('should handle error event with missing message gracefully', async () => {
    const mockStream = createMockSSEStream([
      { type: 'error', payload: {} },
    ]);

    const mockResponse = new Response(mockStream);
    const mockFetch = jest.fn().mockResolvedValue(mockResponse);
    globalThis.fetch = mockFetch;

    const handlers = {
      onError: jest.fn(),
      onStreamClose: jest.fn(),
    };

    const input: WorkflowInput = { prompt: 'Test', files: [] };
    await runWorkflow('test-wf', input, [], handlers);

    expect(handlers.onError).toHaveBeenCalledWith('Unknown error');
    expect(handlers.onStreamClose).toHaveBeenCalled();
  });

  it('should work with minimal handlers (all optional)', async () => {
    const mockStream = createMockSSEStream([
      { type: 'status', payload: { message: 'test' } },
      { type: 'progress', payload: { step: 'test' } },
      { type: 'complete', payload: { result: { markdown: 'done' } } },
    ]);

    const mockResponse = new Response(mockStream);
    const mockFetch = jest.fn().mockResolvedValue(mockResponse);
    globalThis.fetch = mockFetch;

    const input: WorkflowInput = { prompt: 'Test', files: [] };
    await runWorkflow('test-wf', input, [], {});

    // Should not throw even with no handlers
  });

  it('should handle multiple events in a single chunk', async () => {
    const encoder = new TextEncoder();
    const events = [
      { type: 'status', payload: { message: 'Step 1' } },
      { type: 'progress', payload: { step: 'step2' } },
      { type: 'complete', payload: { result: { markdown: 'done' } } },
    ];
    const chunks = events.map((e) => `data: ${JSON.stringify(e)}\n\n`);
    const fullData = chunks.join('');
    const encoded = encoder.encode(fullData);

    const mockStream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(encoded);
        controller.close();
      },
    });

    const mockResponse = new Response(mockStream);
    const mockFetch = jest.fn().mockResolvedValue(mockResponse);
    globalThis.fetch = mockFetch;

    const handlers = {
      onStatus: jest.fn(),
      onProgress: jest.fn(),
      onComplete: jest.fn(),
      onStreamClose: jest.fn(),
    };

    const input: WorkflowInput = { prompt: 'Test', files: [] };
    await runWorkflow('test-wf', input, [], handlers);

    expect(handlers.onStatus).toHaveBeenCalledWith({ message: 'Step 1' });
    expect(handlers.onProgress).toHaveBeenCalledWith({ step: 'step2' });
    expect(handlers.onComplete).toHaveBeenCalledWith({ markdown: 'done' });
    expect(handlers.onStreamClose).toHaveBeenCalled();
  });

  it('should handle HTTP 404 error', async () => {
    const mockFetch = jest.fn().mockResolvedValue(new Response(null, { status: 404 }));
    globalThis.fetch = mockFetch;

    const handlers = {
      onError: jest.fn(),
      onStreamClose: jest.fn(),
    };

    const input: WorkflowInput = { prompt: 'Test', files: [] };
    await runWorkflow('test-wf', input, [], handlers);

    expect(handlers.onError).toHaveBeenCalledWith('HTTP 404');
  });
});
