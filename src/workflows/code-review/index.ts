import type { WorkflowFactory } from '../types.js';

function buildPrompt(input: { prompt: string; files: { name: string; content: string }[] }): string {
  let message = '';

  if (input.files.length > 0) {
    message += '# Code Files for Review\n\n';
    for (const file of input.files) {
      message += `## ${file.name}\n\n`;
      message += '```\n';
      // Decode base64 content for the prompt
      message += Buffer.from(file.content, 'base64').toString('utf-8');
      message += '\n```\n\n';
    }
  }

  if (input.prompt) {
    message += `## User's Question\n\n${input.prompt}`;
  }

  return message;
}

function transformResponse(rawResponse: string): string {
  // Check if the response has markdown headers and organize into sections
  if (rawResponse.includes('## ')) {
    return rawResponse;
  }

  // Otherwise, wrap it in a structured format
  return `## Summary\n\n${rawResponse}`;
}

const factory: WorkflowFactory = (context) => ({
  async run(input) {
    context.emit('status', { message: 'Analyzing your code...' });

    const systemPrompt =
      'You are a senior code reviewer with expertise in multiple programming languages. ' +
      'Review the provided code for bugs, style issues, performance concerns, and suggest improvements. ' +
      'Be specific and provide actionable feedback.';

    const response = await context.copilot.chat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: buildPrompt(input) },
      ],
    });

    context.emit('progress', { step: 'copilot_response_received' });

    const result = { markdown: transformResponse(response) };

    context.emit('complete', { result });
    return result;
  },
});

export default factory;
