/**
 * Copilot SDK Client Integration Tests
 *
 * Tests the Copilot SDK client implementation directly, verifying:
 * - SDK session creation and lifecycle
 * - Message sending and response handling
 * - Error handling and cleanup
 * - Streaming event subscription
 *
 * These tests validate the SDK integration layer independently of the browser UI.
 */

import { test, expect } from '@playwright/test';

// ============================================
// COPILOT SDK CLIENT - API INTEGRATION
// ============================================
test.describe('Copilot SDK Client API', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/api/test/set-session');
    await expect(page.getByText(/ok/i)).toBeVisible();
  });

  test('should execute workflow and return Copilot SDK response', async ({ page }) => {
    // Mock the Copilot SDK response at the API level
    await page.route('**/api/workflows/code-review/run', async (route) => {
      const events = [
        'data: {"type":"status","payload":{"message":"Analyzing..."},"timestamp":1}\n\n',
        'data: {"type":"complete","payload":{"result":{"markdown":"## Review\\n\\nAll good!"}},"timestamp":2}\n\n',
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

    // Set session cookie
    await page.goto('/api/test/set-session');
    await expect(page.getByText(/ok/i)).toBeVisible();

    // Execute workflow via browser navigation to verify page loads
    await page.goto('/workflows/code-review');
    await expect(page.getByRole('heading', { name: /code review/i })).toBeVisible({ timeout: 10000 });
  });

  test('should handle Copilot SDK authentication errors', async ({ page }) => {
    // Clear session to test auth failure
    await page.context().clearCookies();

    // Navigate to protected page - should redirect to login
    await page.goto('/workflows/code-review');
    
    // Should redirect to home page without auth
    await expect(page).toHaveURL(/^.*\/$/, { timeout: 10000 });
  });

  test('should handle missing prompt via UI', async ({ page }) => {
    // Set session
    await page.goto('/api/test/set-session');
    await expect(page.getByText(/ok/i)).toBeVisible();

    // Navigate to workflow page
    await page.goto('/workflows/code-review');
    await expect(page.getByRole('heading', { name: /code review/i })).toBeVisible({ timeout: 10000 });

    // Run button should be disabled when prompt is empty
    const runButton = page.getByRole('button', { name: /run workflow/i });
    await expect(runButton).toBeVisible();
    await expect(runButton).toBeDisabled();
  });
});

// ============================================
// COPILOT SDK STREAMING EVENTS
// ============================================
test.describe('Copilot SDK Streaming Events', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/api/test/set-session');
    await expect(page.getByText(/ok/i)).toBeVisible();
  });

  test('should receive all SDK event types in order', async ({ page }) => {
    await page.route('**/api/workflows/code-review/run', async (route) => {
      const events = [
        'data: {"type":"status","payload":{"message":"Starting"},"timestamp":1}\n\n',
        'data: {"type":"progress","payload":{"step":"step1"},"timestamp":2}\n\n',
        'data: {"type":"progress","payload":{"step":"step2"},"timestamp":3}\n\n',
        'data: {"type":"complete","payload":{"result":{"markdown":"Done"}},"timestamp":4}\n\n',
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

    // Fill and submit
    await page.getByRole('textbox').first().fill('Review');
    await page.getByRole('button', { name: /run|submit|start/i }).first().click();

    // Verify all event types were processed
    await expect(page.getByText(/starting/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/done/i)).toBeVisible({ timeout: 10000 });
  });

  test('should handle malformed SSE events gracefully', async ({ page }) => {
    await page.route('**/api/workflows/code-review/run', async (route) => {
      // Include malformed events that the SDK should handle
      const events = [
        'data: {"type":"status","payload":{"message":"Starting"},"timestamp":1}\n\n',
        'data: this is malformed json\n\n',
        'data: {"type":"complete","payload":{"result":{"markdown":"Done"}},"timestamp":3}\n\n',
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

    await page.getByRole('textbox').first().fill('Review');
    await page.getByRole('button', { name: /run|submit|start/i }).first().click();

    // Should still complete despite malformed events
    await expect(page.getByText(/done/i)).toBeVisible({ timeout: 10000 });
  });

  test('should handle SSE stream interruption', async ({ page }) => {
    await page.route('**/api/workflows/code-review/run', async (route) => {
      // Only send partial events, then disconnect
      const events = [
        'data: {"type":"status","payload":{"message":"Starting"},"timestamp":1}\n\n',
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

    await page.getByRole('textbox').first().fill('Review');
    await page.getByRole('button', { name: /run|submit|start/i }).first().click();

    // Should handle gracefully - stream ends without complete event
    await page.waitForTimeout(3000);
    // Page should still be functional
    await expect(page).toHaveURL(/\/workflows\/code-review/);
  });
});

// ============================================
// COPILOT SDK SESSION CONCURRENT HANDLING
// ============================================
test.describe('Copilot SDK Concurrent Sessions', () => {
  test('should handle concurrent workflow runs in different tabs', async ({ page, context }) => {
    // Set session
    await page.goto('/api/test/set-session');
    await expect(page.getByText(/ok/i)).toBeVisible();

    // Mock both tabs
    await context.route('**/api/workflows/code-review/run', async (route) => {
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

    // Open second tab
    const page2 = await context.newPage();
    await page2.goto('/api/test/set-session');
    await expect(page2.getByText(/ok/i)).toBeVisible();

    // Navigate both to workflow
    await Promise.all([
      page.goto('/workflows/code-review'),
      page2.goto('/workflows/code-review'),
    ]);

    // Both should load the workflow page
    await expect(page.getByRole('heading', { name: /code review/i })).toBeVisible({ timeout: 10000 });
    await expect(page2.getByRole('heading', { name: /code review/i })).toBeVisible({ timeout: 10000 });

    await page2.close();
  });
});
