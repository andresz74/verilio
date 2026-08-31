# Verilio

Verilio is a focused time-tracking, reporting, and invoicing workspace for freelancers.

## Local foundation

Requirements:

- Node.js 22 or newer
- pnpm 9
- Docker with Compose

Copy `.env.example` to `.env`, then run:

```sh
pnpm install
docker compose up -d postgres
pnpm db:migrate
pnpm dev
```

The web app runs at `http://localhost:5173` and proxies health checks to the API at
`http://127.0.0.1:3000`.

## Repository checks

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
```

See `docs/06-verilio_mvp_implementation_plan.md` for milestone scope and exit gates.
