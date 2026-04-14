import type { WorkflowContext, WorkflowInput } from '../types.js';
import workflowFactory from './index';

describe('_example Workflow', () => {
  it('should export a default factory function', async () => {
    expect(typeof workflowFactory).toBe('function');
  });

  it('should emit status, progress, and complete events', async () => {
    const emit = jest.fn();
    const copilotChat = jest.fn().mockResolvedValue('Hello from Copilot!');

    const context: WorkflowContext = {
      workflowId: '_example',
      userId: 'test-user',
      copilot: { chat: copilotChat },
      emit,
    };

    const handler = workflowFactory(context);
    const input: WorkflowInput = {
      prompt: 'Say hello',
      files: [],
    };

    const result = await handler.run(input);

    expect(emit).toHaveBeenCalledTimes(3);
    expect(emit).toHaveBeenNthCalledWith(1, 'status', { message: 'Sending to Copilot...' });
    expect(emit).toHaveBeenNthCalledWith(2, 'progress', { step: 'copilot_response_received' });
    expect(emit).toHaveBeenNthCalledWith(3, 'complete', { result });

    expect(result).toHaveProperty('markdown', 'Hello from Copilot!');
    expect(copilotChat).toHaveBeenCalledWith({
      messages: [
        { role: 'system', content: 'You are a helpful AI assistant.' },
        { role: 'user', content: 'Say hello' },
      ],
    });
  });

  it('should return a result with a markdown field', async () => {
    const emit = jest.fn();
    const copilotChat = jest.fn().mockResolvedValue('## Response\n\nSome markdown');

    const context: WorkflowContext = {
      workflowId: '_example',
      userId: 'test-user',
      copilot: { chat: copilotChat },
      emit,
    };

    const handler = workflowFactory(context);
    const input: WorkflowInput = {
      prompt: 'Test',
      files: [],
    };

    const result = await handler.run(input);

    expect(result.markdown).toBe('## Response\n\nSome markdown');
  });
});
