import { auth } from '@/src/auth';
import { getWorkflow } from '@/src/workflows/loader';
import { createCopilotClient } from '@/src/copilot/client';
import type {
  WorkflowEvent,
  WorkflowEventType,
  WorkflowContext,
  WorkflowInput,
  WorkflowFile,
} from '@/src/workflows/types';
import { NextResponse } from 'next/server';
import path from 'path';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const workflow = getWorkflow(id);
  if (!workflow) {
    return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
  }

  const formData = await request.formData();
  const prompt = formData.get('prompt') as string;

  if (!prompt || typeof prompt !== 'string') {
    return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
  }

  // Parse conversation history
  const conversationHistoryRaw = formData.get('conversationHistory') as string | null;
  let conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  if (conversationHistoryRaw) {
    try {
      conversationHistory = JSON.parse(conversationHistoryRaw);
    } catch {
      // Invalid JSON — ignore
    }
  }

  // Parse files
  const files: WorkflowFile[] = [];
  const fileEntries = formData.getAll('files');

  const maxFiles = workflow.manifest.maxFiles ?? 5;
  const allowedFileTypes = workflow.manifest.allowedFileTypes ?? [];
  const maxFileSize = workflow.manifest.maxFileSize ?? 5 * 1024 * 1024; // 5 MB default

  // Normalize allowed file extensions to dot-prefixed lowercase form
  const normalizedAllowedFileTypes = Array.isArray(allowedFileTypes)
    ? allowedFileTypes
        .map((t) => (typeof t === 'string' ? (t.startsWith('.') ? t.toLowerCase() : `.${t.toLowerCase()}`) : ''))
        .filter(Boolean)
    : [];

  function isFileLike(obj: unknown): obj is File {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      typeof (obj as any).arrayBuffer === 'function' &&
      typeof (obj as any).name === 'string'
    );
  }

  if (fileEntries.length > maxFiles) {
    return NextResponse.json(
      { error: `Maximum ${maxFiles} files allowed` },
      { status: 400 }
    );
  }

  for (const fileEntry of fileEntries) {
    if (!isFileLike(fileEntry)) {
      // Skip non-file entries gracefully
      continue;
    }

    const name = (fileEntry as any).name as string;
    const sizeProp = (fileEntry as any).size;
    if (typeof sizeProp === 'number' && sizeProp > maxFileSize) {
      return NextResponse.json(
        { error: `File "${name}" exceeds maximum size of ${maxFileSize} bytes` },
        { status: 400 }
      );
    }

    const ext = path.extname(name).toLowerCase();
    if (normalizedAllowedFileTypes.length > 0 && !normalizedAllowedFileTypes.includes(ext)) {
      return NextResponse.json(
        {
          error: `File type ${ext || '(no extension)'} not allowed. Allowed: ${normalizedAllowedFileTypes.join(', ')}`,
        },
        { status: 400 }
      );
    }

    const buffer = await (fileEntry as any).arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    files.push({
      name,
      type: (fileEntry as any).type || 'application/octet-stream',
      content: base64,
      size: typeof sizeProp === 'number' ? sizeProp : Buffer.byteLength(Buffer.from(buffer)),
    });
  }

  const input: WorkflowInput = { prompt, files };

  // Create Copilot client with user's token
  const baseCopilot = createCopilotClient(session.githubAccessToken!);

  // Wrap the copilot client to automatically inject skills and conversation history
  const copilot = {
    async chat(options: Parameters<typeof baseCopilot.chat>[0]) {
      // Prepend conversation history before the workflow's messages
      const historyMessages = conversationHistory.map((msg, i) => ({
        role: msg.role,
        content: msg.content,
      }));
      const allMessages = [...historyMessages, ...options.messages];

      return baseCopilot.chat({
        ...options,
        messages: allMessages,
        skillDirectories: workflow.skillDirectories.length > 0
          ? workflow.skillDirectories
          : options.skillDirectories,
        disabledSkills: workflow.manifest.disabledSkills && workflow.manifest.disabledSkills.length > 0
          ? workflow.manifest.disabledSkills
          : options.disabledSkills,
      });
    },
  };

  // Create SSE stream
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const encode = (event: WorkflowEvent) =>
        encoder.encode(`data: ${JSON.stringify(event)}\n\n`);

      const emit = (type: WorkflowEventType, payload: unknown) => {
        controller.enqueue(
          encode({ type, payload, timestamp: Date.now() })
        );
      };

      const context: WorkflowContext = {
        workflowId: id,
        userId: session.user?.email ?? 'unknown',
        copilot,
        emit,
      };

      try {
        const handler = workflow.factory(context);
        const result = await handler.run(input);
        emit('complete', { result });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        emit('error', { message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
