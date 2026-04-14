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

  // Parse files
  const files: WorkflowFile[] = [];
  const fileEntries = formData.getAll('files');

  const maxFiles = workflow.manifest.maxFiles ?? 5;
  const allowedFileTypes = workflow.manifest.allowedFileTypes;

  if (fileEntries.length > maxFiles) {
    return NextResponse.json(
      { error: `Maximum ${maxFiles} files allowed` },
      { status: 400 }
    );
  }

  for (const fileEntry of fileEntries) {
    if (fileEntry instanceof File) {
      // Validate file type
      if (allowedFileTypes && allowedFileTypes.length > 0) {
        const ext = '.' + fileEntry.name.split('.').pop()?.toLowerCase();
        if (!allowedFileTypes.includes(ext)) {
          return NextResponse.json(
            { error: `File type ${ext} not allowed. Allowed: ${allowedFileTypes.join(', ')}` },
            { status: 400 }
          );
        }
      }

      const buffer = await fileEntry.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');

      files.push({
        name: fileEntry.name,
        type: fileEntry.type || 'application/octet-stream',
        content: base64,
        size: fileEntry.size,
      });
    }
  }

  const input: WorkflowInput = { prompt, files };

  // Create Copilot client with user's token
  const baseCopilot = createCopilotClient(session.githubAccessToken!);

  // Wrap the copilot client to automatically inject skills
  const copilot = {
    async chat(options: Parameters<typeof baseCopilot.chat>[0]) {
      return baseCopilot.chat({
        ...options,
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
