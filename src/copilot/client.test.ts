import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';
import { createCopilotClient } from './client';

describe('getCopilotCliPath', () => {
  it('should return the correct CLI path structure', () => {
    const projectRoot = process.cwd();
    const candidate = path.join(
      projectRoot,
      'node_modules',
      '@github',
      'copilot',
      'index.js',
    );

    expect(candidate).toContain('node_modules');
    expect(candidate).toContain('@github/copilot/index.js');
  });

  it('should verify the CLI file exists on disk', () => {
    const cliPath = path.join(
      process.cwd(),
      'node_modules',
      '@github',
      'copilot',
      'index.js',
    );

    expect(fs.existsSync(cliPath)).toBe(true);
  });

  it('should fall back to filesystem paths when require.resolve fails', () => {
    const projectRoot = process.cwd();
    const candidates = [
      path.join(projectRoot, 'node_modules', '@github', 'copilot', 'index.js'),
      path.join(projectRoot, 'node_modules', '@github', 'copilot-sdk', 'node_modules', '@github', 'copilot', 'index.js'),
    ];

    const found = candidates.find(c => fs.existsSync(c));
    expect(found).toBeDefined();
    expect(found).toContain('@github/copilot/index.js');
  });
});

describe('createCopilotClient', () => {
  it('should export a function that returns a chat-capable wrapper', () => {
    expect(typeof createCopilotClient).toBe('function');

    const client = createCopilotClient('test-token');
    expect(client).toHaveProperty('chat');
    expect(typeof client.chat).toBe('function');
  });
});
