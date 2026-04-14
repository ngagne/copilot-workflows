jest.mock('@/src/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/src/workflows/loader', () => ({
  getWorkflows: jest.fn(),
}));

describe('GET /api/workflows', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('should return 401 when unauthenticated', async () => {
    const { auth } = await import('@/src/auth');
    (auth as jest.Mock).mockResolvedValue(null);

    const { GET } = await import('@/app/api/workflows/route');
    const response = await GET();

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it('should return 200 with workflow manifests when authenticated', async () => {
    const { auth } = await import('@/src/auth');
    (auth as jest.Mock).mockResolvedValue({
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
    (getWorkflows as jest.Mock).mockReturnValue(mockWorkflows);

    const { GET } = await import('@/app/api/workflows/route');
    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(mockWorkflows);
  });
});
