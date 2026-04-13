import { auth } from '@/src/auth';

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isProtected =
    req.nextUrl.pathname.startsWith('/dashboard') ||
    req.nextUrl.pathname.startsWith('/workflows') ||
    req.nextUrl.pathname.startsWith('/api/workflows');

  if (isProtected && !isLoggedIn) {
    return Response.redirect(new URL('/', req.url));
  }
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth|api/test).*)'],
};
