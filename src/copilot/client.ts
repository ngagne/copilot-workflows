import { CopilotClient, approveAll } from '@github/copilot-sdk';
import type { CopilotClient as ICopilotClient } from '@/src/workflows/types';
import path from 'path';

/**
 * Resolve the path to the bundled Copilot CLI.
 * Uses require.resolve to find the actual package location regardless of
 * how the project is structured (flat, nested, hoisted node_modules).
 */
function getCopilotCliPath(): string {
  try {
    return require.resolve('@github/copilot');
  } catch {
    // Fallback: try common paths relative to project root
    const projectRoot = process.cwd();
    const candidates = [
      path.join(projectRoot, 'node_modules', '@github', 'copilot', 'index.js'),
      path.join(projectRoot, 'node_modules', '@github', 'copilot-sdk', 'node_modules', '@github', 'copilot', 'index.js'),
    ];
    const fs = require('fs');
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    throw new Error(
      `Cannot find @github/copilot CLI. Searched: ${candidates.join(', ')}`
    );
  }
}

/**
 * Creates a CopilotClient instance using the Copilot SDK.
 * The SDK manages a CLI process and communicates via JSON-RPC.
 *
 * For server deployments with per-user isolation, consider:
 * - Using cliUrl to connect to per-user CLI servers
 * - Or a shared service-account token with user context in prompts
 */
export function createCopilotClient(accessToken: string): ICopilotClient {
  return {
    async chat({ messages, skillDirectories, disabledSkills }) {
      // Resolve CLI path explicitly to avoid Next.js bundling issues
      const cliPath = getCopilotCliPath();

      // Create a per-user CLI process. The SDK spawns a CLI subprocess and passes
      // the user's GitHub OAuth token via COPILOT_SDK_AUTH_TOKEN env var, ensuring
      // each request uses the specific user's credentials — no shared login.
      const client = new CopilotClient({
        cliPath,
        githubToken: accessToken,  // User's GitHub OAuth token from the OAuth flow
        autoStart: true,
        useLoggedInUser: false,    // Don't use stored CLI auth — use the provided token
      });

      await client.start();

      try {
        // Create a session with the user's GitHub token and skills
        const sessionConfig: any = {
          model: 'gpt-4.1',
          onPermissionRequest: approveAll,
          systemMessage: {
            content: '',
          },
        };

        if (skillDirectories && skillDirectories.length > 0) {
          sessionConfig.skillDirectories = skillDirectories;
        }

        if (disabledSkills && disabledSkills.length > 0) {
          sessionConfig.disabledSkills = disabledSkills;
        }

        const session = await client.createSession(sessionConfig);

        try {
          // Build the prompt from messages
          const systemMessage = messages.find((m) => m.role === 'system');
          const userMessages = messages.filter((m) => m.role !== 'system');
          const prompt = userMessages.map((m) => m.content).join('\n\n');

          // Set up promise to capture the assistant's response
          const responsePromise = new Promise<string>((resolve, reject) => {
            let fullContent = '';

            session.on('assistant.message', (event) => {
              fullContent = event.data.content;
            });

            session.on('session.idle', () => {
              resolve(fullContent);
            });

            session.on('session.error', (event) => {
              reject(
                new Error(
                  `Copilot session error: ${event.data.errorType} - ${event.data.message}`
                )
              );
            });
          });

          // Send the prompt with system context
          await session.send({
            prompt: systemMessage
              ? `${systemMessage.content}\n\n---\n\n${prompt}`
              : prompt,
          });

          return await responsePromise;
        } finally {
          await session.disconnect();
        }
      } finally {
        await client.stop();
      }
    },
  };
}
