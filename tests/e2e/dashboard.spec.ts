import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Set session before each test
    await page.goto('/api/test/set-session');
    await expect(page.getByText('ok')).toBeVisible();
  });

  test('should display workflow cards with correct names', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page.getByRole('heading', { name: 'Workflows' })).toBeVisible();
    await expect(page.getByText('Select a workflow to get started')).toBeVisible();

    // Check that workflow cards are rendered
    const cards = page.getByRole('link').filter({ hasText: /workflow/i });
    // At minimum the code-review workflow should be visible
    await expect(page.getByRole('link', { name: /code review/i })).toBeVisible();
  });

  test('should navigate to workflow page when clicking a card', async ({ page }) => {
    await page.goto('/dashboard');

    // Click the Code Review workflow card
    await page.getByRole('link', { name: /code review/i }).click();

    // Should be on the workflow page
    await expect(page.getByRole('heading', { name: 'Code Review' })).toBeVisible();
    expect(page.url()).toContain('/workflows/code-review');
  });

  test('should redirect unauthenticated visit to /', async ({ page }) => {
    await page.context().clearCookies();

    await page.goto('/dashboard');

    expect(page.url()).toMatch(/\/$/);
    await expect(page.getByRole('heading', { name: 'AI Workflows' })).toBeVisible();
  });
});
