import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/src/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/src/workflows/loader', () => ({
  getWorkflows: vi.fn(),
}));

describe('GET /api/workflows', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('should return 401 when unauthenticated', async () => {
    const { auth } = await import('@/src/auth');
    vi.mocked(auth).mockResolvedValue(null);

    const { GET } = await import('@/app/api/workflows/route');
    const response = await GET();

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it('should return 200 with workflow manifests when authenticated', async () => {
    const { auth } = await import('@/src/auth');
    vi.mocked(auth).mockResolvedValue({
      user: { email: 'test@example.com' },
      githubAccessToken: 'token',
    });

    const { getWorkflows } = await import('@/src/workflows/loader');
    const mockWorkflows = [
      {
        id: 'test',
        name: 'Test Workflow',
        description: 'A test',
        version: '1.0.0',
        acceptsFiles: false,
      },
    ];
    vi.mocked(getWorkflows).mockReturnValue(mockWorkflows as any);

    const { GET } = await import('@/app/api/workflows/route');
    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(mockWorkflows);
  });
});
