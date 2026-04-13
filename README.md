# Copilot Workflows

A Next.js web application for running AI-powered workflows backed by GitHub Copilot. Users sign in with GitHub, browse a catalog of workflows, and execute them with a prompt and optional code file uploads.

## Features

- **GitHub OAuth authentication** with per-user Copilot API calls
- **Workflow dashboard** listing available workflows as cards
- **Live workflow runner** with prompt input, file drag-and-drop, and real-time streaming results via SSE
- **Pluggable architecture** — add new workflows by dropping a folder with a manifest and factory function
- **Built-in workflows:**
  - **Code Review** — submit code files for Copilot to review for bugs, style issues, and improvements
  - **Echo** — a simple template workflow that sends your prompt to Copilot and returns the response

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript |
| UI | React 19 with CSS Modules |
| Auth | Auth.js (NextAuth v5) with GitHub OAuth |
| AI | [@github/copilot-sdk](https://www.npmjs.com/package/@github/copilot-sdk) |
| Markdown | `marked` |
| Unit Tests | Vitest + v8 coverage |
| E2E Tests | Playwright |
| Linting | ESLint 9 |

## Getting Started

### Prerequisites

- Node.js 18+
- A [GitHub OAuth App](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app) registered for your environment
- A GitHub account with an active Copilot subscription

### Environment Variables

Create a `.env.local` file:

```env
# GitHub OAuth (register at github.com/settings/developers)
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=change-me-to-a-long-random-string-32-chars-min

# Enable test-only session endpoint for e2e tests
ENABLE_TEST_SESSION=true
```

### OAuth App Setup

1. Go to **github.com → Settings → Developer Settings → OAuth Apps → New OAuth App**
2. Set:
   - **Homepage URL:** `http://localhost:3000`
   - **Authorization callback URL:** `http://localhost:3000/api/auth/callback/github`
3. Copy the **Client ID** and generate a **Client Secret**
4. Add them to your `.env.local`

### Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with GitHub.

## Scripts

```bash
npm run dev          # Development server
npm run build        # Production build
npm run start        # Production server
npm run lint         # ESLint
npm run test         # Unit tests with coverage
npm run test:watch   # Unit tests (watch mode)
npm run test:e2e     # E2E tests (Playwright)
```

## Project Structure

```
├── app/                              # Next.js App Router
│   ├── api/
│   │   ├── auth/[...nextauth]/       # OAuth callback endpoint
│   │   ├── workflows/                # Workflow API (list + run via SSE)
│   │   └── test/set-session/         # Test-only auth helper
│   ├── dashboard/page.tsx            # Workflow catalog (protected)
│   ├── workflows/[id]/page.tsx       # Workflow runner page (protected)
│   └── page.tsx                      # Landing/sign-in page
├── src/
│   ├── auth.ts                       # NextAuth + GitHub OAuth config
│   ├── copilot/client.ts             # CopilotClient factory (per-user SDK client)
│   ├── lib/runWorkflow.ts            # Client-side SSE consumer
│   ├── components/
│   │   ├── Nav/                      # Top navigation bar
│   │   ├── WorkflowCard/             # Dashboard workflow card
│   │   ├── WorkflowRunner/           # Prompt + file drop + runner
│   │   ├── FileDropzone/             # Drag-and-drop file upload
│   │   └── ResponsePanel/            # Streaming result display
│   └── workflows/
│       ├── types.ts                  # Shared type definitions
│       ├── loader.ts                 # Workflow filesystem loader
│       ├── code-review/              # Code review workflow
│       └── _example/                 # Echo/template workflow
├── tests/e2e/                        # Playwright E2E tests
├── middleware.ts                     # Route protection
└── playwright.config.ts
```

## Creating a New Workflow

### 1. Create a folder

```bash
mkdir src/workflows/my-workflow
```

### 2. Add `manifest.json`

```json
{
  "id": "my-workflow",
  "name": "My Workflow",
  "description": "What this workflow does",
  "version": "1.0.0",
  "acceptsFiles": true,
  "maxFiles": 5,
  "allowedFileTypes": [".ts", ".js"],
  "promptPlaceholder": "Enter a prompt…",
  "tags": ["custom"]
}
```

### 3. Add `index.ts`

```ts
import type { WorkflowFactory } from '../types.js';

const factory: WorkflowFactory = (context) => ({
  async run(input) {
    // input.prompt — user's text
    // input.files  — uploaded files ({ name, type, content (base64), size })

    context.emit('status', { message: 'Working on it…' });

    const response = await context.copilot.chat({
      messages: [
        { role: 'system', content: 'Your system prompt here.' },
        { role: 'user', content: input.prompt },
      ],
    });

    return { markdown: response };
  },
});

export default factory;
```

### 4. Register the import

In `src/workflows/loader.ts`, add an entry to `WORKFLOW_IMPORTS`:

```ts
const WORKFLOW_IMPORTS: Record<string, () => Promise<WorkflowModule>> = {
  _example: () => import('./_example/index'),
  'code-review': () => import('./code-review/index'),
  'my-workflow': () => import('./my-workflow/index'),  // ← add this
};
```

### 5. Add tests

```bash
src/workflows/my-workflow/index.test.ts
```

## Architecture

### Authentication Flow

1. User lands on `/` and clicks **Sign in with GitHub**
2. Auth.js redirects to GitHub OAuth (scope: `read:user user:email repo`)
3. After consent, GitHub redirects to `/api/auth/callback/github`
4. The OAuth access token is stored in the NextAuth session as `githubAccessToken`
5. `middleware.ts` protects `/dashboard`, `/workflows/*`, and `/api/workflows/*` — unauthenticated visitors are redirected to `/`

### Workflow Execution

1. User fills in a prompt (and optionally uploads files) on the workflow runner page
2. The browser `POST`s to `/api/workflows/[id]/run` with `FormData`
3. The API route authenticates the user, loads the workflow factory, and creates a **per-user** Copilot SDK client using the user's GitHub OAuth token
4. The workflow's `run()` method executes, emitting `status`, `progress`, and `complete` events via an SSE stream
5. The browser's `runWorkflow()` SSE consumer decodes events and updates the UI in real time

### Copilot SDK

The app uses `@github/copilot-sdk` which spawns a Copilot CLI subprocess and communicates via JSON-RPC. Each workflow run creates a dedicated CLI process with the user's GitHub OAuth token, ensuring requests are made on behalf of the specific user — no shared credentials.

## Testing

```bash
# Unit tests + coverage (all thresholds ≥ 80%)
npm run test

# Watch mode
npm run test:watch

# E2E tests (requires dev server running)
npm run dev          # terminal 1: start dev server
npm run test:e2e     # terminal 2: run Playwright tests
```
