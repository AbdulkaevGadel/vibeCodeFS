# Support Admin

Next.js App Router admin panel for SupportBot.

## Purpose

`support-admin` is the manager-facing UI for support chats, manager administration, and Knowledge Base maintenance.

Runtime boundaries:

- routes and page-level composition live in `src/app`;
- FSD page slices live in `src/fsd-pages`;
- widgets, features, entities, and shared primitives live in their matching FSD layers;
- privileged reads and mutations stay behind server-side loaders, Server Actions, RPC, or route handlers.

## Commands

```bash
npm run dev
npm run build
npm run lint
```

## Environment

The app expects Supabase and internal integration environment variables to be configured by the local environment or deployment platform.

Do not commit secrets or service-role keys.
