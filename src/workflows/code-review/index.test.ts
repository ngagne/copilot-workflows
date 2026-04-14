import type { WorkflowContext, WorkflowInput } from '../types.js';
import workflowFactory from './index';

describe('Code Review Workflow', () => {
  it('should export a default factory function', async () => {
    expect(typeof workflowFactory).toBe('function');
  });

  it('should emit status, progress, and complete events', async () => {
    const emit = jest.fn();
    const copilotChat = jest.fn().mockResolvedValue('## Summary\n\nGood code.');

    const context: WorkflowContext = {
      workflowId: 'code-review',
      userId: 'test-user',
      copilot: { chat: copilotChat },
      emit,
    };

    const handler = workflowFactory(context);
    const input: WorkflowInput = {
      prompt: 'Review this code',
      files: [
        {
          name: 'test.ts',
          type: 'text/typescript',
          content: Buffer.from('const x = 1;').toString('base64'),
          size: 12,
        },
      ],
    };

    const result = await handler.run(input);

    expect(emit).toHaveBeenCalledTimes(3);
    expect(emit).toHaveBeenNthCalledWith(1, 'status', { message: 'Analyzing your code...' });
    expect(emit).toHaveBeenNthCalledWith(2, 'progress', { step: 'copilot_response_received' });
    expect(emit).toHaveBeenNthCalledWith(3, 'complete', { result });

    expect(result).toHaveProperty('markdown');
  });

  it('should include file contents in the prompt', async () => {
    const emit = jest.fn();
    const copilotChat = jest.fn().mockResolvedValue('Looks good!');

    const context: WorkflowContext = {
      workflowId: 'code-review',
      userId: 'test-user',
      copilot: { chat: copilotChat },
      emit,
    };

    const handler = workflowFactory(context);
    const fileContent = 'const x = 1;';
    const input: WorkflowInput = {
      prompt: 'Check for bugs',
      files: [
        {
          name: 'app.ts',
          type: 'text/typescript',
          content: Buffer.from(fileContent).toString('base64'),
          size: fileContent.length,
        },
      ],
    };

    await handler.run(input);

    const promptArg = (copilotChat as jest.Mock).mock.calls[0][0];
    expect(promptArg.messages[1].content).toContain('app.ts');
    expect(promptArg.messages[1].content).toContain(fileContent);
    expect(promptArg.messages[1].content).toContain('Check for bugs');
  });

  it('should use a senior code reviewer system prompt', async () => {
    const emit = jest.fn();
    const copilotChat = jest.fn().mockResolvedValue('OK');

    const context: WorkflowContext = {
      workflowId: 'code-review',
      userId: 'test-user',
      copilot: { chat: copilotChat },
      emit,
    };

    const handler = workflowFactory(context);
    const input: WorkflowInput = { prompt: 'Review', files: [] };

    await handler.run(input);

    const promptArg = (copilotChat as jest.Mock).mock.calls[0][0];
    expect(promptArg.messages[0].role).toBe('system');
    expect(promptArg.messages[0].content).toContain('senior code reviewer');
  });

  it('should transform response into structured format', async () => {
    const emit = jest.fn();
    const copilotChat = jest.fn().mockResolvedValue('Some plain feedback');

    const context: WorkflowContext = {
      workflowId: 'code-review',
      userId: 'test-user',
      copilot: { chat: copilotChat },
      emit,
    };

    const handler = workflowFactory(context);
    const input: WorkflowInput = { prompt: 'Review', files: [] };

    const result = await handler.run(input);

    expect(result.markdown).toContain('## Summary');
    expect(result.markdown).toContain('Some plain feedback');
  });
});
