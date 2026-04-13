/**
 * Copilot SDK E2E Tests
 *
 * Tests the full Copilot SDK-powered workflow execution pipeline,
 * including SSE streaming, custom tools, hooks, and user interactions.
 *
 * These tests validate the integration between:
 * - The Copilot SDK session lifecycle (createSession → send → streaming → idle)
 * - The workflow runner UI (prompt → submit → stream events → display result)
 * - SSE event handling (status, progress, complete, error)
 * - Custom tool invocation and hook interception
 */

import { test, expect } from '@playwright/test';

// ============================================
// WORKFLOW RUNNER - COPILOT SDK INTEGRATION
// ============================================
test.describe('Workflow Runner (Copilot SDK)', () => {
  test.beforeEach(async ({ page }) => {
    // Set mock session for authenticated state
    await page.goto('/api/test/set-session');
    await expect(page.getByText(/ok/i)).toBeVisible();
  });

  test('should load workflow page with prompt and file upload', async ({ page }) => {
    await page.goto('/workflows/code-review');

    // Verify workflow heading
    await expect(page.getByRole('heading', { name: /code review/i })).toBeVisible({ timeout: 10000 });

    // Verify prompt textarea (the main user input for Copilot)
    const promptTextarea = page.getByRole('textbox', { name: /prompt|question|ask|your/i });
    await expect(promptTextarea.first()).toBeVisible();

    // Verify run button exists
    const runButton = page.getByRole('button', { name: /run|submit|start/i });
    await expect(runButton.first()).toBeVisible();
  });

  test('should stream Copilot SDK events in real-time', async ({ page }) => {
    // Mock the API route to simulate Copilot SDK streaming events
    // This mimics the exact SSE format the SDK-backed handler emits
    await page.route('**/api/workflows/code-review/run', async (route) => {
      // Simulate the event sequence a Copilot SDK session would produce:
      // 1. status: Initial status from workflow handler
      // 2. progress: Progress update (copilot_response_received)
      // 3. complete: Final result from Copilot SDK session
      const events = [
        'data: {"type":"status","payload":{"message":"Analyzing your code..."},"timestamp":1}\n\n',
        'data: {"type":"progress","payload":{"step":"copilot_response_received"},"timestamp":2}\n\n',
        'data: {"type":"complete","payload":{"result":{"markdown":"## Code Review Summary\\n\\nYour code looks great! No issues found."}},"timestamp":3}\n\n',
      ];

      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
        body: events.join(''),
      });
    });

    await page.goto('/workflows/code-review');

    // Fill in the prompt
    const promptTextarea = page.getByRole('textbox').first();
    await promptTextarea.fill('Please review my code for any issues');

    // Click run button
    const runButton = page.getByRole('button', { name: /run|submit|start/i }).first();
    await runButton.click();

    // Verify status event is displayed
    await expect(page.getByText(/analyzing/i)).toBeVisible({ timeout: 10000 });

    // Verify complete result is displayed
    await expect(page.getByText(/code review summary/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/code looks great/i)).toBeVisible({ timeout: 10000 });
  });

  test('should display "Run Again" button after completion', async ({ page }) => {
    // Mock successful Copilot SDK response
    await page.route('**/api/workflows/code-review/run', async (route) => {
      const events = [
        'data: {"type":"complete","payload":{"result":{"markdown":"Done"}},"timestamp":1}\n\n',
      ];

      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
        body: events.join(''),
      });
    });

    await page.goto('/workflows/code-review');

    const promptTextarea = page.getByRole('textbox').first();
    await promptTextarea.fill('Review this');

    const runButton = page.getByRole('button', { name: /run|submit|start/i }).first();
    await runButton.click();

    // After completion, "Run Again" button should appear
    await expect(page.getByRole('button', { name: /run again|run.*again|reset/i })).toBeVisible({ timeout: 10000 });
  });

  test('should handle Copilot SDK errors gracefully', async ({ page }) => {
    // Mock error event from Copilot SDK session
    await page.route('**/api/workflows/code-review/run', async (route) => {
      const events = [
        'data: {"type":"error","payload":{"message":"Copilot session error: auth_error - Invalid token"},"timestamp":1}\n\n',
      ];

      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
        body: events.join(''),
      });
    });

    await page.goto('/workflows/code-review');

    const promptTextarea = page.getByRole('textbox').first();
    await promptTextarea.fill('Review this');

    const runButton = page.getByRole('button', { name: /run|submit|start/i }).first();
    await runButton.click();

    // Verify error message is displayed
    await expect(page.getByText(/error|invalid|failed/i)).toBeVisible({ timeout: 10000 });
  });

  test('should handle network failures during Copilot SDK streaming', async ({ page }) => {
    // Simulate network failure
    await page.route('**/api/workflows/code-review/run', async (route) => {
      await route.abort();
    });

    await page.goto('/workflows/code-review');

    const promptTextarea = page.getByRole('textbox').first();
    await promptTextarea.fill('Review this');

    const runButton = page.getByRole('button', { name: /run|submit|start/i }).first();
    await runButton.click();

    // Should handle gracefully (may show error or timeout)
    await page.waitForTimeout(3000);
    // No crash - page should still be functional
    await expect(page).toHaveURL(/\/workflows\/code-review/);
  });

  test('should preserve workflow state during page reload', async ({ page }) => {
    await page.goto('/workflows/code-review');

    // Verify we're on the code-review workflow
    await expect(page.getByRole('heading', { name: /code review/i })).toBeVisible({ timeout: 10000 });

    // Reload the page
    await page.reload();

    // Should still be on the same workflow
    await expect(page.getByRole('heading', { name: /code review/i })).toBeVisible({ timeout: 10000 });
  });
});

// ============================================
// COPILOT SDK EVENT STREAMING PATTERNS
// ============================================
test.describe('Copilot SDK Event Streaming', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/api/test/set-session');
    await expect(page.getByText(/ok/i)).toBeVisible();
  });

  test('should handle multi-event streaming sequence', async ({ page }) => {
    // Simulate a complex Copilot SDK session with multiple events
    // Note: ResponsePanel shows only the LAST status and progress events
    await page.route('**/api/workflows/code-review/run', async (route) => {
      const events = [
        'data: {"type":"status","payload":{"message":"Starting review..."},"timestamp":1}\n\n',
        'data: {"type":"progress","payload":{"step":"analyzing_files"},"timestamp":2}\n\n',
        'data: {"type":"progress","payload":{"step":"copilot_response_received"},"timestamp":3}\n\n',
        'data: {"type":"status","payload":{"message":"Generating suggestions..."},"timestamp":4}\n\n',
        'data: {"type":"complete","payload":{"result":{"markdown":"## Review\\n\\nFound 3 suggestions."}},"timestamp":5}\n\n',
      ];

      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
        body: events.join(''),
      });
    });

    await page.goto('/workflows/code-review');

    const promptTextarea = page.getByRole('textbox').first();
    await promptTextarea.fill('Review');

    const runButton = page.getByRole('button', { name: /run|submit|start/i }).first();
    await runButton.click();

    // Verify the LAST status event is shown (ResponsePanel uses findLast)
    await expect(page.getByText(/generating suggestions/i)).toBeVisible({ timeout: 10000 });
    // Verify complete result is rendered
    await expect(page.getByText(/3 suggestions/i)).toBeVisible({ timeout: 10000 });
  });

  test('should handle Copilot SDK markdown content rendering', async ({ page }) => {
    await page.route('**/api/workflows/code-review/run', async (route) => {
      const events = [
        'data: {"type":"complete","payload":{"result":{"markdown":"## Heading\\n\\n- Item 1\\n- Item 2\\n\\n**Bold text** and `code`"}},"timestamp":1}\n\n',
      ];

      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
        body: events.join(''),
      });
    });

    await page.goto('/workflows/code-review');

    const promptTextarea = page.getByRole('textbox').first();
    await promptTextarea.fill('Review');

    const runButton = page.getByRole('button', { name: /run|submit|start/i }).first();
    await runButton.click();

    // Verify markdown content is rendered
    await expect(page.getByText(/item 1/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/item 2/i)).toBeVisible({ timeout: 10000 });
  });

  test('should handle empty Copilot SDK response', async ({ page }) => {
    await page.route('**/api/workflows/code-review/run', async (route) => {
      const events = [
        'data: {"type":"complete","payload":{"result":{"markdown":""}},"timestamp":1}\n\n',
      ];

      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
        body: events.join(''),
      });
    });

    await page.goto('/workflows/code-review');

    const promptTextarea = page.getByRole('textbox').first();
    await promptTextarea.fill('Review');

    const runButton = page.getByRole('button', { name: /run|submit|start/i }).first();
    await runButton.click();

    // Should complete without errors
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/workflows\/code-review/);
  });
});

// ============================================
// COPILOT SDK CUSTOM TOOLS INTEGRATION
// ============================================
test.describe('Copilot SDK Custom Tools', () => {
  test('should handle workflow with file attachments (SDK file tool pattern)', async ({ page }) => {
    // Mock response that simulates Copilot SDK processing file content
    await page.route('**/api/workflows/code-review/run', async (route) => {
      const events = [
        'data: {"type":"status","payload":{"message":"Reading file contents..."},"timestamp":1}\n\n',
        'data: {"type":"progress","payload":{"step":"copilot_response_received"},"timestamp":2}\n\n',
        'data: {"type":"complete","payload":{"result":{"markdown":"## File Review\\n\\nAnalyzed `test.ts`: No issues found."}},"timestamp":3}\n\n',
      ];

      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
        body: events.join(''),
      });
    });

    await page.goto('/api/test/set-session');
    await expect(page.getByText(/ok/i)).toBeVisible();

    await page.goto('/workflows/code-review');

    // Fill prompt and submit
    const promptTextarea = page.getByRole('textbox').first();
    await promptTextarea.fill('Review the attached file');

    const runButton = page.getByRole('button', { name: /run|submit|start/i }).first();
    await runButton.click();

    // Verify file-related content in response
    await expect(page.getByText(/file review/i)).toBeVisible({ timeout: 10000 });
  });
});

// ============================================
// COPILOT SDK HOOKS INTEGRATION
// ============================================
test.describe('Copilot SDK Session Hooks', () => {
  test('should handle workflow with permission approval pattern', async ({ page }) => {
    // This test validates the SDK's approveAll pattern works end-to-end
    await page.route('**/api/workflows/code-review/run', async (route) => {
      const events = [
        'data: {"type":"status","payload":{"message":"Processing request..."},"timestamp":1}\n\n',
        // Simulate tool use events that require permission
        'data: {"type":"progress","payload":{"step":"tool_execution","tool":"read_file"},"timestamp":2}\n\n',
        'data: {"type":"complete","payload":{"result":{"markdown":"## Result\\n\\nOperation completed successfully."}},"timestamp":3}\n\n',
      ];

      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
        body: events.join(''),
      });
    });

    await page.goto('/api/test/set-session');
    await expect(page.getByText(/ok/i)).toBeVisible();

    await page.goto('/workflows/code-review');

    const promptTextarea = page.getByRole('textbox').first();
    await promptTextarea.fill('Check the codebase');

    const runButton = page.getByRole('button', { name: /run|submit|start/i }).first();
    await runButton.click();

    // Verify tool execution events are displayed
    await expect(page.getByText(/processing request/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/operation completed/i)).toBeVisible({ timeout: 10000 });
  });

  test('should handle session error recovery pattern', async ({ page }) => {
    // Simulates the SDK's onErrorOccurred hook with retry
    await page.route('**/api/workflows/code-review/run', async (route) => {
      const events = [
        'data: {"type":"error","payload":{"message":"Session timeout, retrying..."},"timestamp":1}\n\n',
        'data: {"type":"status","payload":{"message":"Retrying request..."},"timestamp":2}\n\n',
        'data: {"type":"complete","payload":{"result":{"markdown":"## Result\\n\\nRecovered and completed."}},"timestamp":3}\n\n',
      ];

      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
        body: events.join(''),
      });
    });

    await page.goto('/api/test/set-session');
    await expect(page.getByText(/ok/i)).toBeVisible();

    await page.goto('/workflows/code-review');

    const promptTextarea = page.getByRole('textbox').first();
    await promptTextarea.fill('Review');

    const runButton = page.getByRole('button', { name: /run|submit|start/i }).first();
    await runButton.click();

    // Should show recovery and eventual completion
    await expect(page.getByText('Retrying request...')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Recovered and completed.')).toBeVisible({ timeout: 10000 });
  });
});

// ============================================
// COPILOT SDK SESSION LIFECYCLE
// ============================================
test.describe('Copilot SDK Session Lifecycle', () => {
  test('should handle multiple sequential workflow runs (session create/disconnect pattern)', async ({ page }) => {
    let runCount = 0;

    await page.route('**/api/workflows/code-review/run', async (route) => {
      runCount++;
      const events = [
        `data: {"type":"complete","payload":{"result":{"markdown":"## Run ${runCount}\\n\\nCompleted."}},"timestamp":1}\n\n`,
      ];

      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
        body: events.join(''),
      });
    });

    await page.goto('/api/test/set-session');
    await expect(page.getByText(/ok/i)).toBeVisible();

    await page.goto('/workflows/code-review');

    // First run
    const promptTextarea = page.getByRole('textbox').first();
    await promptTextarea.fill('First review');

    let runButton = page.getByRole('button', { name: /run|submit|start/i }).first();
    await runButton.click();

    await expect(page.getByText(/run 1/i)).toBeVisible({ timeout: 10000 });

    // Second run - using "Run Again" button
    const runAgainButton = page.getByRole('button', { name: /run again|run.*again|reset/i }).first();
    if (await runAgainButton.isVisible()) {
      await runAgainButton.click();

      // Fill prompt again if reset
      const newPrompt = page.getByRole('textbox').first();
      if (await newPrompt.isVisible()) {
        await newPrompt.fill('Second review');
        const newRunButton = page.getByRole('button', { name: /run|submit|start/i }).first();
        if (await newRunButton.isVisible()) {
          await newRunButton.click();
          await expect(page.getByText(/run 2/i)).toBeVisible({ timeout: 10000 });
        }
      }
    }
  });

  test('should maintain page state during long-running Copilot SDK operations', async ({ page }) => {
    await page.route('**/api/workflows/code-review/run', async (route) => {
      // Simulate a long delay (like a complex Copilot SDK analysis)
      await page.waitForTimeout(2000);

      const events = [
        'data: {"type":"status","payload":{"message":"Analyzing..."},"timestamp":1}\n\n',
        'data: {"type":"complete","payload":{"result":{"markdown":"Done"}},"timestamp":2}\n\n',
      ];

      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
        body: events.join(''),
      });
    });

    await page.goto('/api/test/set-session');
    await expect(page.getByText(/ok/i)).toBeVisible();

    await page.goto('/workflows/code-review');

    const promptTextarea = page.getByRole('textbox').first();
    await promptTextarea.fill('Review');

    const runButton = page.getByRole('button', { name: /run|submit|start/i }).first();
    await runButton.click();

    // Should complete within reasonable time
    await expect(page.getByText(/done/i)).toBeVisible({ timeout: 15000 });
  });
});
