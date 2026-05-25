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
- enabled interactive elements must use the project semantic `support-interactive` cursor behavior when they are not already covered by a shared primitive
- shared primitives such as `Button`, `Modal`, tooltip triggers, and reusable links should include `support-interactive` centrally
- do not add one-off `cursor-pointer` / `disabled:cursor-not-allowed` classes when the element can use `support-interactive` or an existing shared primitive

## UI Reuse Check

Before changing UI in `support-admin`, first check existing shared UI primitives, FSD layer candidates, and nearby transitional route-local components.

Check at minimum:
- `src/shared/ui`
- relevant `widgets`, `features`, `entities`, and `shared` candidates when they exist
- nearby `_components` as transitional legacy
- existing component patterns in the same route/page

Rules:
- Reuse `Button`, `Toast`, modal, form, badge, and card-like patterns when they match the behavior and semantic role.
- Do not hand-roll a new button, alert, toast, modal, or repeated card layout if an existing component already fits.
- Do not move UI into `shared` only because Tailwind classes look similar.
- Simple route-only glue may stay near the route/page while it is small, not reused, and has no independent FSD responsibility.
- Do not add new frontend code to `_components` / `_lib` when it already has a clear `widgets`, `features`, `entities`, or `shared` responsibility.
- Promote to shared only after real cross-route reuse is clear.

## Pragmatic FSD Rules

`support-admin` uses pragmatic Feature-Sliced Design as the target frontend architecture.

This is an app-specific override for `support-admin`: these FSD rules take priority over root-level route-local `_components` / `_lib` defaults when they conflict. Root frontend rules still apply where they do not conflict with this section.

Next.js App Router mapping:
- `src/app` is the routing boundary for routes, guards, route-level data loading, redirects, and composition.
- `app/.../page.tsx` is a route entry and composition layer, not the place for stable domain/UI architecture.
- `src/fsd-pages` is the physical folder for the logical FSD `pages` layer.
- Do not create `src/pages` for FSD page slices, because `src/pages` can activate or imply Next.js Pages Router semantics and conflict with the App Router architecture.
- `widgets` are large standalone page UI blocks with a composition role.
- `features` are user actions and use-cases, such as `send-message`, `transfer-chat`, or `update-chat-status`.
- `entities` are stable domain entities with their own model, types, UI, or behavior, such as `chat`, `message`, `manager`, or `knowledge-article`.
- `shared` is only for stable primitives, utilities, infrastructure, and config with real cross-domain reuse.

FSD terminology:
- `app`, `pages`, `widgets`, `features`, `entities`, and `shared` are layers.
- Do not introduce the deprecated `processes` layer.
- Folders inside layers are slices, for example `widgets/chat-details`, `widgets/chat-list`, `entities/chat`, or `entities/message`.
- Folders inside slices are segments, for example `ui`, `model`, `api`, and `lib`.
- Choose a layer by architectural role.
- Create a slice only when it has independent responsibility inside its layer.
- Use segments to separate responsibility inside an existing slice.
- Do not confuse layers, slices, and segments.
- Do not create a new slice only for thematic grouping when the code still depends on the parent slice context.
- Do not create segments preemptively when a small slice is still readable as a flat folder.
- Keep context-dependent UI, such as a chat details message timeline, inside the owning slice segment instead of promoting it to a separate widget, feature, or entity.
- Keep `index.ts` as the pure public API barrel for the slice.

FSD slice naming:
- Slice names inside FSD layers must describe the product/domain responsibility clearly, not only use the shortest generic noun.
- Use explicit domain-qualified names when a short name can conflict with platform terms, UI terms, database terms, or another slice/layer meaning.
- Prefer `support-chat` over generic `chat` when the code represents a support-domain conversation, because Telegram also has `chat` and UI widgets also use chat terminology.
- Prefer `chat-message` over generic `message` when the code represents one message inside a support chat.
- Do not over-qualify names when the short name is already unambiguous in the current app.

Dependency direction:
- `app` may import `widgets`, `features`, `entities`, and `shared`.
- `widgets` may import `features`, `entities`, and `shared`.
- `features` may import `entities` and `shared`.
- `entities` may import `shared`.
- `shared` must not import upper FSD layers.
- Lower FSD layers must not import `app`.

Transition rules:
- Existing `_components` / `_lib` folders are transitional legacy, not the target folder-formation model.
- Do not create `widgets`, `features`, `entities`, or `shared` folders only because FSD has those layers.
- Do not start a full-project FSD rewrite in one task.
- Move code into an FSD layer by responsibility, reuse, or complexity pressure, not by the idea that "lower is better".
- `shared` is the strictest promotion target and requires stable cross-domain reuse.
- Do not move code into a new FSD layer silently; explain the reason, target layer, affected files, and wait for approval.

FSD placement review:
- After each frontend implementation task in `support-admin`, review touched frontend code placement.
- If the code is still simple and route-specific, it may stay near the route/page.
- If a large page-level UI block appeared, recommend `widgets`.
- If a user interaction or use-case appeared, recommend `features`.
- If a stable domain entity with types, model, UI, or behavior appeared, recommend `entities`.
- If a cross-domain primitive, utility, infrastructure, or config appeared, recommend `shared`.
- In the final report, explicitly state one result:
  - `No FSD promotion needed`;
  - `FSD promotion recommended`;
  - `FSD promotion approved and completed`.

FSD public API files:
- In `support-admin/src/{fsd-pages,shared,entities,features,widgets}/**/index.ts`, keep `index.ts` files as pure public API barrels.
- Allowed in `index.ts`: `export * from "./model";`, `export { SomeComponent } from "./ui/some-component";`, `export type { SomeType } from "./model";`.
- Forbidden in `index.ts`: declaring types, functions, helpers, constants, React components, or runtime logic directly.
- Put implementation details in named files such as `model.ts`, `lib.ts`, `ui.tsx`, `api.ts`, or more specific modules.
- Reason: `index.ts` controls the public API of an FSD slice and must not become a mixed dump as the product grows.

Server-only entity API:
- Server-only entity API modules, such as `entities/*/api/*`, must not be exported through the root entity public barrel when that root barrel is used by Client Components.
- Import server-only entity API directly from its server-only module path, for example `@/entities/manager/api/current-manager`.
- Root entity barrels should stay safe for shared server/client domain contracts, pure helpers, and types.
- Reason: this prevents accidental `server-only` imports from Client Components while still allowing Server Actions and server loaders to use entity-owned server helpers.

Feature Server Action barrels:
- If a root feature barrel exports Server Actions, Client Components and widgets must not import action result or contract types from that root barrel.
- Client Components and widgets should import those type contracts from the feature `model` public API, for example `@/features/manage-managers/model`.
- Route entrypoints and server-side composition code may import Server Actions from the root feature barrel when they wire actions into page/widget props.
- Widgets must receive privileged Server Actions through props/action objects and must not import `features/*/api/*` implementation modules directly.
- Reason: this keeps the client/widget boundary away from server-only mutation implementation while still allowing explicit action wiring at the `app` composition boundary.

## Component Decomposition Rule

When a `support-admin` Client Component grows beyond a simple view, decompose it before adding more behavior.

Preferred split:
- presentational subcomponents for repeated or visually distinct UI blocks;
- local helper functions for pure formatting, mapping, and conditional UI decisions;
- local hooks for stateful workflows, polling, timers, subscriptions, and multi-step async UI logic;
- FSD layer modules when the extracted code has a clear `widgets`, `features`, `entities`, or `shared` responsibility.
- route-local `_lib` helpers only as transitional route-only glue when the logic is small, route-specific, and not ready for an FSD layer.

Rules:
- do not keep unrelated workflows inside one large component;
- do not extract only because code is long if the extracted piece has no clear role;
- do not move logic to `shared` unless it has real cross-domain reuse;
- keep business mutations in Server Actions / RPC, not in React hooks;
- keep hooks focused on UI state and synchronization, not backend authority.
- For React component files, keep the exported/main component as the final meaningful block whenever practical.
- Place imports, types, constants, local helpers, and small private subcomponents above the exported/main component so the file can be read top-down.
- Prefer separate FSD layer modules for extracted components with a standalone responsibility, especially when the parent file is already large.
- Prefer one main exported React component and one UI role per component module.
- Do not keep multiple exported React components with different UI roles, different import sites, or different slot ownership in one file; split them into explicitly named modules.
- Small private JSX fragments, render helpers, and private subcomponents may stay in the same file when they only support the main exported component and do not form a standalone UI role.
- UI component modules should not own exported non-component contracts when those contracts are imported by other modules.
- Exported widget/feature contracts, such as action bags, wiring types, DTO props shared across modules, or public callback contracts, should live in the responsible `model` file or segment and be re-exported through the slice `index.ts`.
- Component props types may stay in the component file when they are only local to that component and are not imported as a separate contract elsewhere.
- Avoid leaving React subcomponents, type blocks, or helper functions below the main component unless there is a strong local reason.
- After editing or moving a React component file, perform a local structure pass before finishing the task.
- The structure pass must check this order: imports, types, constants, helpers/private subcomponents, then the exported/main component as the final meaningful block.
- Do this check for mechanical file moves as well as new component code; moving legacy files into FSD slices is not enough by itself.
- When a component accumulates multiple pure view helpers for labels, variants, className selection, safe display formatting, or view-only filtering/sorting, move them to a neighboring `*-utils.ts` file in the same widget/feature/entity.
- Keep such helpers out of `entities/*/lib.ts` unless they describe reusable pure operations on the domain model rather than one widget's presentation.
- Do not extract a single tiny helper by default; extract when helper volume starts to hide the component's render/composition role.

## Helper / Mapper Placement

Helper, util, mapper, and formatter files should be grouped by subject area, not by one-function-per-file.

Rules:
- multiple closely related helpers may live in one file when they serve the same domain or UI responsibility;
- do not create broad generic files such as `utils.ts`, `helpers.ts`, or `common.ts` when the file can be named by purpose, for example `knowledge-embedding-status-utils.ts`, `manager-row-mappers.ts`, or `support-chat-date-utils.ts`;
- if a helper belongs only to one widget, feature, entity, or route, keep it inside that slice or nearby route-local folder;
- if a helper describes a domain entity or maps domain rows/DTOs, keep it in the responsible `entities/*/model` or `entities/*/lib`;
- if a helper is presentation-specific, such as labels, badge variants, button titles, className selection, or UI-only filtering, keep it near the owning widget/feature UI;
- move helpers to `shared` only after real cross-domain reuse exists;
- do not dump unrelated helpers into global `shared/utils`;
- prefer explicit file names based on responsibility over generic names.

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
- FSD placement must not move privileged business mutations into Client Components.
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
- New auth UI should follow the pragmatic FSD rules when it has stable `widgets`, `features`, `entities`, or `shared` responsibility.

SHOULD:
- Keep auth screens visually consistent in spacing, radius, borders, alerts, and text hierarchy.
- Extract auth UI patterns only when they repeat with the same semantic role.
- Keep helper and component placement predictable: route-only glue first, responsible FSD layer second, global shared last.

Notes:
- `DebugPanel` is a development tool and must not be part of the auth-flow contract.
- `LoginTestAccount` is a demo/onboarding block and must not affect business logic.
- Do not add new abstraction layers unless they simplify the current code immediately.
