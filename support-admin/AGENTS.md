<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Styling Default For Production

For production UI work in `support-admin`, use this default:

- not pure Tailwind only
- not pure CSS Modules only
- use Tailwind for layout/composition
- use design tokens for colors, radius, shadows, spacing semantics
- use CSS Modules pointwise when a component layout or styling becomes too noisy in JSX

Rule:
- if a visual value repeats, promote it to a token instead of hardcoding it again
- do not introduce CSS Modules everywhere by default
