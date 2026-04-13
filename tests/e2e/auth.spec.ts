import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should show login page with GitHub sign-in button', async ({ page }) => {
    await page.goto('/');

    // Check headline is visible
    await expect(page.getByRole('heading', { name: 'AI Workflows' })).toBeVisible();

    // Check GitHub sign-in button
    await expect(page.getByRole('button', { name: /sign in with github/i })).toBeVisible();
  });

  test('should redirect to dashboard when authenticated', async ({ page }) => {
    // Set a test session
    await page.goto('/api/test/set-session');
    await expect(page.getByText('ok')).toBeVisible();

    // Navigate to dashboard — should not redirect back to /
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Workflows' })).toBeVisible();

    // Should not be on the login page
    await expect(page.getByRole('heading', { name: 'AI Workflows' })).not.toBeVisible();
  });

  test('should redirect unauthenticated dashboard visit to login', async ({ page }) => {
    // Don't set session — ensure no auth cookies
    await page.context().clearCookies();

    await page.goto('/dashboard');

    // Should redirect to home
    expect(page.url()).toContain('/');
    await expect(page.getByRole('heading', { name: 'AI Workflows' })).toBeVisible();
  });
});
