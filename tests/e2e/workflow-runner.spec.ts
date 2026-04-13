import { test, expect } from '@playwright/test';

test.describe('Workflow Runner', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/api/test/set-session');
    await expect(page.getByText('ok')).toBeVisible();
  });

  test('should show prompt textarea and file dropzone', async ({ page }) => {
    await page.goto('/workflows/code-review');

    // Check prompt textarea is visible
    await expect(page.getByRole('textbox', { name: /your prompt/i })).toBeVisible();

    // Check file dropzone is visible
    await expect(page.getByText('Drop files here or click to browse')).toBeVisible();

    // Check submit button is visible
    await expect(page.getByRole('button', { name: 'Run Workflow' })).toBeVisible();
  });

  test('should submit workflow and show response', async ({ page }) => {
    await page.goto('/workflows/code-review');

    // Intercept the workflow run API with a mock SSE response
    await page.route('**/api/workflows/code-review/run', async (route) => {
      const encoder = new TextEncoder();
      const events = [
        'data: {"type":"status","payload":{"message":"Analyzing your code..."},"timestamp":1}\n\n',
        'data: {"type":"progress","payload":{"step":"copilot_response_received"},"timestamp":2}\n\n',
        'data: {"type":"complete","payload":{"result":{"markdown":"## Summary\\n\\nCode looks good."}},"timestamp":3}\n\n',
      ];
      const body = events.join('');

      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
        body,
      });
    });

    // Fill in the prompt
    await page.getByRole('textbox', { name: /your prompt/i }).fill('Review my code');

    // Submit
    await page.getByRole('button', { name: 'Run Workflow' }).click();

    // Wait for the response panel to show the result
    await expect(page.getByText('Code looks good.')).toBeVisible({ timeout: 10000 });

    // Check "Run Again" button appears
    await expect(page.getByRole('button', { name: 'Run Again' })).toBeVisible();
  });

  test('should show error state on API failure', async ({ page }) => {
    await page.goto('/workflows/code-review');

    // Mock error response
    await page.route('**/api/workflows/code-review/run', async (route) => {
      const encoder = new TextEncoder();
      const events = [
        'data: {"type":"error","payload":{"message":"Copilot service unavailable"},"timestamp":1}\n\n',
      ];

      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
        },
        body: events.join(''),
      });
    });

    await page.getByRole('textbox', { name: /your prompt/i }).fill('Test');
    await page.getByRole('button', { name: 'Run Workflow' }).click();

    // Should show error message
    await expect(page.getByText('Copilot service unavailable')).toBeVisible({ timeout: 10000 });
  });
});
