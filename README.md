# EventTicketing

Turborepo monorepo with npm workspaces.

## Packages

| Path | Package | Role |
|------|---------|------|
| `apps/web` | `@event-ticketing/web` | Next.js frontend |
| `apps/api` | `@event-ticketing/api` | Express API |
| `packages/shared` | `@event-ticketing/shared` | Shared TypeScript types |

## Setup

```bash
npm install
```

## Development

From the repo root:

```bash
npm run dev
```

- Web: http://localhost:3000
- API: http://localhost:4000 (`GET /health`)

## Other scripts

```bash
npm run build
npm run lint
npm run typecheck
```

## Environment

Copy `.env.example` values into local `.env` files as needed:

- `PORT` — API port (default `4000`)
- `NEXT_PUBLIC_API_URL` — API URL for the web app (default `http://localhost:4000`)
