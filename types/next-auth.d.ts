import NextAuth from 'next-auth';

declare module 'next-auth' {
  interface Session {
    githubAccessToken?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    githubAccessToken?: string;
  }
}
