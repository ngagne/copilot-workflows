export interface WorkflowManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  acceptsFiles: boolean;
  maxFiles?: number;
  allowedFileTypes?: string[];
  promptPlaceholder?: string;
  tags?: string[];
  model?: string;
  disabledSkills?: string[];
}

export interface WorkflowFile {
  name: string;
  type: string;
  content: string; // base64 encoded
  size: number;
}

export interface WorkflowInput {
  prompt: string;
  files: WorkflowFile[];
}

export interface WorkflowResult {
  markdown?: string;
  data?: unknown;
  metadata?: Record<string, unknown>;
}

export type WorkflowEventType = 'status' | 'progress' | 'error' | 'complete';

export interface WorkflowEvent {
  type: WorkflowEventType;
  payload: unknown;
  timestamp: number;
}

export interface CopilotClient {
  chat(options: {
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    skillDirectories?: string[];
    disabledSkills?: string[];
  }): Promise<string>;
}

export interface WorkflowContext {
  workflowId: string;
  userId: string;
  copilot: CopilotClient;
  emit: (type: WorkflowEventType, payload: unknown) => void;
}

export interface WorkflowHandler {
  run(input: WorkflowInput): Promise<WorkflowResult>;
}

export type WorkflowFactory = (context: WorkflowContext) => WorkflowHandler;

export interface LoadedWorkflow {
  manifest: WorkflowManifest;
  factory: WorkflowFactory;
  skillDirectories: string[];
}
