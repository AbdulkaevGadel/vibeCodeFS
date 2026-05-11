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
