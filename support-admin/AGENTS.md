<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Styling Default For Production

For production UI work in `support-admin`, use this default:

- Tailwind remains the default styling tool for React components.
- Short, obvious one-off utility classes may stay inline in `className`.
- Long, repeated, or condition-heavy class strings should be extracted into local `const ...ClassName` variables near the component.
- Reusable UI behavior or repeated visual structures should be extracted into components, not only into class constants.
- Project-level semantic classes such as `support-panel`, `support-card`, `support-text-muted`, and `support-surface-*` are allowed only for shared visual primitives and design tokens.
- CSS Modules are reserved for page-level layout or cases where Tailwind is inconvenient, not as the default replacement for Tailwind.

Rule:
- if a visual value repeats, promote it to a token instead of hardcoding it again
- do not turn `globals.css` into a dump for component-specific styles
- do not introduce CSS Modules everywhere by default
- do not add `clsx`, `cn`, `cva`, or similar helpers until class composition becomes repetitive enough to justify it

## UI Reuse Check

Before changing UI in `support-admin`, first check existing shared UI primitives and nearby route-local components.

Check at minimum:
- `src/shared/ui`
- nearby `_components`
- existing component patterns in the same route/page

Rules:
- Reuse `Button`, `Toast`, modal, form, badge, and card-like patterns when they match the behavior and semantic role.
- Do not hand-roll a new button, alert, toast, modal, or repeated card layout if an existing component already fits.
- Do not move UI into `shared` only because Tailwind classes look similar.
- Prefer local constants or local components for one-route UI.
- Promote to shared only after real cross-route reuse is clear.

## Component Decomposition Rule

When a `support-admin` Client Component grows beyond a simple view, decompose it before adding more behavior.

Preferred split:
- presentational subcomponents for repeated or visually distinct UI blocks;
- local helper functions for pure formatting, mapping, and conditional UI decisions;
- local hooks for stateful workflows, polling, timers, subscriptions, and multi-step async UI logic;
- route-local `_lib` helpers when logic is reused across components in the same route/domain.

Rules:
- do not keep unrelated workflows inside one large component;
- do not extract only because code is long if the extracted piece has no clear role;
- do not move logic to `shared` unless it has real cross-domain reuse;
- keep business mutations in Server Actions / RPC, not in React hooks;
- keep hooks focused on UI state and synchronization, not backend authority.

## Async UI Sync Rule

For UI flows that start DB-side or Edge Function async work, do not rely on repeated full-route `router.refresh()` as the primary synchronization mechanism.

Preferred pattern:
- start the primary mutation via Server Action;
- show a local optimistic transitional state when async work is expected;
- poll a narrow Server Action/RPC that returns the specific entity/job state;
- run one final `router.refresh()` only after the entity/job reaches a terminal state;
- best-effort background bootstrap errors must be logged but must not turn a successful primary mutation into a false user-facing failure.

## Support Admin Architecture Boundaries

These rules are permanent for the `support-admin` frontend.

- Support Admin must read support-domain data through approved server-side boundaries.
- Client Components may subscribe to Supabase Realtime only for UI synchronization.
- Business mutations must stay behind Server Actions / RPC.
- React must not own workflow consistency.
- Backend / DB remains the source of truth for chat status, assignment, unread state, AI state, and message delivery state.
- Realtime callbacks must not become orchestration logic.
- Frontend code must not call AI providers, Telegram API, or privileged backend resources directly.

## Inbox Pagination Cache

For paginated inbox state in `support-admin`, `sessionStorage` is allowed only as a short-lived UI cache for the current browser tab.

Allowed use:
- preserve already loaded inbox pages while the manager selects chats in the same tab;
- keep cache scoped by bot filter / inbox scope;
- treat cached rows as UI continuity only, never as source of truth.

Forbidden:
- using `localStorage` for inbox rows, unread state, cursor state, or realtime-derived support data;
- treating cached inbox rows as authoritative after backend refresh, RPC results, or realtime updates;
- using browser storage to hide backend unread/read-state bugs.

Reason:
- inbox ordering, unread counts, and previews are realtime-sensitive;
- data should not survive across tabs or long-lived browser sessions as if it were canonical;
- Supabase/RPC/realtime remain the source of truth.

## Support Admin UI Rules

MUST:
- Auth pages must follow this shape: `page -> page-level data/guards -> shell -> form + extra blocks`.
- Auth `page.tsx` must stay orchestration-only.
- Auth `page.tsx` must not contain repeated layout or large view implementations.
- Repeated auth layout must live in one place.
- Debug/demo blocks must not affect redirect logic, cookies, session flow, or server auth contracts.
- Auth-specific UI must stay inside the auth domain until there is real reuse outside auth.

SHOULD:
- Keep auth screens visually consistent in spacing, radius, borders, alerts, and text hierarchy.
- Extract auth UI patterns only when they repeat with the same semantic role.
- Keep helper and component placement predictable: page-local first, auth-shared second, global shared last.

Notes:
- `DebugPanel` is a development tool and must not be part of the auth-flow contract.
- `LoginTestAccount` is a demo/onboarding block and must not affect business logic.
- Do not add new abstraction layers unless they simplify the current code immediately.
