import { NextResponse } from 'next/server';
import { encode } from 'next-auth/jwt';

/**
 * Test-only route that sets a mock session cookie with a valid JWT.
 * Only available when ENABLE_TEST_SESSION is set.
 * 
 * Creates a proper JWT token that NextAuth's auth() function can parse,
 * enabling e2e tests to access authenticated pages.
 */
export async function GET(request: Request) {
  if (process.env.ENABLE_TEST_SESSION !== 'true' && process.env.NODE_ENV !== 'test') {
    return NextResponse.json({ error: 'Not available' }, { status: 404 });
  }

  const secret = process.env.NEXTAUTH_SECRET || 'this-is-a-fallback-secret-for-development-1234567890';

  // Create a valid JWT token that NextAuth's auth() can parse
  const token = await encode({
    secret,
    salt: 'authjs.session-token',
    token: {
      name: 'Test User',
      email: 'test@example.com',
      picture: 'https://example.com/avatar.png',
      sub: 'test-user-id',
      githubAccessToken: 'test-github-token-for-copilot-sdk',
    },
    maxAge: 86400, // 24 hours
  });

  const response = NextResponse.json({ ok: true });

  // Set the JWT as the NextAuth session cookie
  // NextAuth v5 (authjs) uses "authjs.session-token" as the default cookie name
  response.cookies.set(
    'authjs.session-token',
    token,
    {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
    }
  );

  return response;
}
