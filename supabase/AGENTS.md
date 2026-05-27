# AGENTS.md - Supabase Backend Rules

## 1. Scope

This file applies to files inside `supabase/`.

The repository root `AGENTS.md` remains the source of general project rules. This file adds local rules for Supabase Edge Functions, migrations, SQL scripts, Deno runtime, secrets/logging, and Supabase backend boundaries.

Do not copy frontend or Next.js rules into this file. Frontend-specific rules belong in `support-admin/AGENTS.md`.

---

## 2. Backend Architecture Boundary

The approved project architecture is:

```text
Telegram -> Edge Function -> Supabase -> Next.js
```

Do not change this architecture from files inside `supabase/` without user approval.

Backend work in this folder assumes:
- Supabase Edge Functions;
- Supabase Database;
- Deno runtime;
- Supabase deployment for functions and database.

Do not introduce a Node.js backend runtime, separate server framework, ORM, or alternate database access architecture for Supabase tasks.

---

## 3. Backend Data Flow

The current backend direction is:

1. Telegram sends a webhook request.
2. Edge Function receives the request.
3. Edge Function validates incoming data.
4. Edge Function resolves or creates support-domain records as needed.
5. Edge Function persists relational data in Supabase.
6. Next.js admin panel reads relational support data through the approved backend/database boundary.
7. Managers process chats, assignments, and statuses in the admin UI.

Keep Supabase code compatible with this flow unless an approved task explicitly changes it.

---

## 4. Runtime

Supabase Edge Functions run on Deno, not Node.js.

Forbidden:
- `npm install` as a solution for Edge Function runtime or Deno typing;
- `require()`;
- `node_modules`;
- Express-style servers;
- Node-specific `axios` usage;
- Node.js-only APIs in Edge Functions.

Allowed:
- URL imports;
- Deno-compatible imports;
- `fetch`;
- `Deno.env`;
- Web standard `Request` / `Response` APIs.

If local IDE or TypeScript support does not recognize `Deno`, check the shared functions-level setup first:

- `supabase/functions/tsconfig.json`;
- `supabase/functions/deno-shim.d.ts`.

Do not copy `tsconfig.json` or `deno-shim.d.ts` into every Edge Function.

---

## 5. Supabase CLI Structure

Keep the Supabase CLI project structure explicit:

- `supabase/config.toml` for Supabase project configuration;
- `supabase/functions` for Edge Functions;
- `supabase/migrations` for schema, policy, grant, trigger, and RPC migrations;
- `supabase/sql` for historical manual, backfill, and verification scripts.

Do not introduce backend FSD, MVC folders, generic `controllers`, generic `services`, generic `repositories`, or ORM-style `models` inside `supabase/`.

---

## 6. Edge Function Boundaries

Use a small number of domain/feature-oriented "fat" Edge Functions as runtime and deployment boundaries.

Keep `supabase/functions/<function-name>/index.ts` as the function entry point. It should stay readable as the request/response boundary.

Prefer local modules and `functions/_shared` for decomposition instead of creating many tiny deployed Edge Functions.

Do not change the deployed function boundary without an approved task.

For Supabase Edge Functions, `index.ts` should stay focused on the HTTP boundary:
- method/auth guard;
- reading and validating the payload;
- selecting the handler/workflow;
- formatting the HTTP response.

Move long workflows, RPC orchestration, provider calls, parsing/chunking, and state-machine logic into function-local modules next to the owning function when they make `index.ts` hard to read.

Edge Functions must:
- validate input;
- never trust incoming data;
- log errors without exposing secrets;
- keep webhook/request logic explicit;
- preserve Telegram-specific HTTP response semantics where the active task requires it.

Telegram webhook handlers must return HTTP 200 to Telegram for handled validation, parsing, duplicate, or domain-processing errors unless an approved task explicitly changes this behavior.

---

## 7. `functions/_shared` Boundaries

`supabase/functions/_shared` is for small reusable Deno-compatible infrastructure and clearly reused domain helpers.

Allowed shared infrastructure examples:
- HTTP response helpers;
- method guards;
- safe error formatting;
- internal auth helpers;
- environment validation;
- generic Supabase REST/RPC call helpers;
- Telegram API base behavior used by multiple functions.

`_shared/supabase` must stay infrastructure-focused. It must not become a hidden repository layer, service layer, ORM, or domain workflow abstraction.

Keep domain-specific database helpers near the owning function first. Move them to a domain-specific shared folder only after real reuse exists.

Prefer function-local modules inside the specific Edge Function folder before introducing shared domain modules. Move code to `functions/_shared` only when multiple functions genuinely reuse it and the shared module does not hide an important domain or database contract.

Do not create `_shared/ai`, `_shared/knowledge-base`, or `_shared/support-domain` until an approved task needs them.

---

## 8. Supabase Access Pattern

Use these boundaries unless an approved task explicitly changes them:

- Edge Function backend work uses `service_role`;
- privileged admin mutations stay server-side;
- anon key usage is allowed only where it fits the approved architecture;
- security-sensitive workflows should be enforced by database constraints, RLS, grants, and `security definer` RPCs where appropriate.

Do not expose `service_role` to the frontend.

---

## 9. Query Style

Use direct Supabase queries, direct REST/RPC calls, and explicit SQL migrations.

Allowed:
- direct table queries;
- direct RPC calls;
- simple local helper functions;
- focused shared infrastructure helpers;
- explicit SQL migrations.

If an Edge Function calls multiple RPCs, or the same RPC is used across multiple workflow branches, prefer a function-local `rpc.ts` with explicit RPC names, payload keys, and result types. Do not hide the database contract behind a generic repository or service abstraction.

Forbidden:
- repository pattern;
- service layer abstraction jungle;
- ORM;
- broad generic data-access abstractions that hide the actual Supabase contract.

---

## 10. Database Contract Rules

The database may use a normalized relational structure when it reflects the approved support domain.

Allowed:
- multiple tables;
- foreign keys;
- joins where they reflect real relations;
- normalization;
- indexes;
- RLS;
- migration-driven changes.

Required:
- every new table must have a clear business reason;
- every relation must reflect the actual support domain;
- every schema change must go through migrations;
- constraints must enforce critical business rules in the database;
- RLS, grants, and `security definer` RPCs must match the intended access boundary.

Forbidden:
- adding tables only "for future use";
- denormalization without a clear reason;
- storing assignment state in the wrong entity;
- mixing current state and history in one table when they serve different purposes;
- changing database contracts manually without a matching migration.

---

## 11. Support Domain Database Guardrails

Current support-domain entities:
- `client`;
- `chat`;
- `manager`;
- `message`;
- `chat_assignment`;
- `assignment_history`.

Core rules:
- `Client` is a Telegram user, not an auth user;
- `Manager` is an admin-panel user linked to `auth.users`;
- `Chat` is the central support-processing entity;
- manager assignment happens on `chat`, not on `client`;
- current assignment and assignment history must be stored separately.

Do not move assignment state to the wrong entity or collapse current assignment and history into one table without an approved schema task.

---

## 12. Migrations

All schema, RPC, RLS, policy, grant, trigger, and database contract changes must go through migrations in `supabase/migrations`.

Before creating any migration, explicitly state:
- that a migration is needed;
- why it is needed;
- what schema/security/data contract it changes;
- whether there is a manual Supabase step around it;
- what must be verified after it is applied.

Rules:
- one migration = one clear purpose;
- do not make silent schema changes;
- do not edit an already applied migration;
- all existing migrations are treated as already applied unless the user explicitly confirms otherwise;
- fixes after an applied migration require a new migration file;
- do not use SQL Editor for schema changes.

If the user asks to refine or fix an existing migration, first ask whether that migration has already been applied in Supabase.

---

## 13. `supabase/sql`

`supabase/sql` is not part of the Supabase migration flow.

Use it for historical manual scripts, backfills, and verification scripts when an approved task calls for that.

Do not put new schema changes in `supabase/sql`.

Do not run mutating historical or backfill scripts unless the task explicitly approves that manual step.

Prefer read-only SQL for inspection and verification.

---

## 14. SQL Editor

Use SQL Editor primarily for read-only `SELECT` inspection and verification.

Forbidden in SQL Editor:
- creating tables;
- altering tables;
- creating or replacing functions;
- changing triggers;
- changing RLS policies;
- changing grants.

The only allowed mutation exception is initializing or updating sensitive secrets that should not be committed to Git, such as `system_settings` or `internal_secret`, when an approved task requires it.

---

## 15. Internal Auth, Secrets, And Logging

Treat internal auth as a security boundary.

Do not log:
- secret values;
- full `Authorization` headers;
- full internal secret headers;
- provider tokens;
- service role keys;
- full sensitive request payloads.

Log enough context to debug failures, but keep secret-bearing values redacted or omitted.

Internal auth helpers must return clear errors without exposing the expected secret or received secret.

---

## 16. Manual Steps And Verification Labels

Call out Supabase manual steps before they are reached.

Examples:
- checking current tables in Supabase;
- applying migrations;
- enabling RLS;
- validating policies;
- verifying data backfill;
- inspecting dashboard state after schema rollout;
- checking function secrets.

Use these labels when they apply:
- `Manual Step`;
- `Code Step`;
- `Decision Required`;
- `Verification`.

---

## 17. Local Verification

For Edge Function TypeScript verification, use the shared functions-level config:

```bash
node support-admin/node_modules/typescript/bin/tsc -p supabase/functions/tsconfig.json
```

Task-specific verification may also require focused manual function checks, read-only SQL checks, or Supabase dashboard inspection. Call out those manual steps before they are reached.

Do not introduce Node.js dependencies as a workaround for Deno verification.

When refactoring pure logic that affects user-facing output, retrieval, chunking, ranking, or bot answer text, capture a lightweight before/after verification artifact before changing the logic. Use a snapshot, fixture check, or focused test. If the check only verifies pure logic, it must not call Supabase, external provider APIs, or mutate database state.

---

## 18. Backend-Specific Rule Updates

If a Supabase/backend task introduces or confirms a stable backend pattern, propose documenting it in `supabase/AGENTS.md` instead of only leaving it in `docs/plan/plan.md` or task history. Do not edit this file until the user approves the rule change.
