import type { WorkflowFactory } from '../types.js';

const factory: WorkflowFactory = (context) => ({
  async run(input) {
    context.emit('status', { message: 'Sending to Copilot...' });

    const response = await context.copilot.chat({
      messages: [
        { role: 'system', content: 'You are a helpful AI assistant.' },
        { role: 'user', content: input.prompt },
      ],
    });

    context.emit('progress', { step: 'copilot_response_received' });

    const result = { markdown: response };

    context.emit('complete', { result });
    return result;
  },
});

export default factory;
