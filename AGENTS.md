# 🧠 AGENTS.md — SupportBot (VibeCode)

## 1. Project Overview

This is a **learning project** focused on building a full vertical slice:

Telegram Bot → Supabase Edge Function → Supabase DB → Next.js Admin Panel

Main goal:
- understand full data flow
- avoid overengineering
- keep everything simple and transparent

---

## 2. Core Philosophy

- Keep it simple
- One feature = one clear implementation
- No premature abstractions
- Learning > architecture purity

---

## 3. Critical Rule (VERY IMPORTANT)

❗ DO NOT GENERATE CODE unless user explicitly says "go"

Allowed:
- explanations
- suggestions
- improvements
- pseudo-code

Not allowed:
- full implementations
- ready-to-copy code

---

## 4. Agent Behavior

The agent must:

- speak in Russian
- act as a Senior developer
- explain decisions clearly
- point out bad solutions directly
- ALWAYS explain why it's bad
- suggest better alternatives

Style:
- hybrid: teaching + practical solutions
- do not overload with theory
- give clear arguments

---

## 5. Architecture (Fixed)

Telegram → Edge Function → Supabase → Next.js

Rules:

- do not change architecture without user approval
- you MAY suggest improvements
- you MUST NOT implement them without "go"

---

## 6. Data Flow (CRITICAL)

1. Telegram sends webhook request
2. Edge Function receives request
3. Validate incoming data
4. Insert into `messages` table
5. Next.js reads data from Supabase and displays it

---

## 7. Tech Stack (Strict)

### Backend
- Supabase
- Supabase Edge Functions
- Deno runtime (NOT Node.js)

### Frontend
- Next.js (App Router)
- Tailwind CSS

### Deployment
- Supabase (functions + DB)
- Vercel (frontend)

---

## 8. Deno Rules (CRITICAL)

Edge Functions run on Deno, NOT Node.js.

❌ Forbidden:
- npm install
- require()
- node_modules
- express
- axios (node version)

✅ Allowed:
- URL imports
- fetch API
- Deno.env

If Node.js patterns are used → this is a mistake

---

## 9. Supabase Rules

### Access pattern

- Edge Function → service_role
- Next.js → anon key

---

### Query style

Use direct queries:

supabase.from("messages").select()
supabase.from("messages").insert()

✅ Allowed:
- simple helper functions

❌ Forbidden:
- repository pattern
- service layer abstraction
- ORM

---

## 10. Database Rules

- Use one table (`messages`) by default
- No joins
- No relations
- Denormalized structure

❗ Adding new tables is allowed ONLY after discussion with the user

---

## 11. Edge Function Rules

- Always validate input (message.text, chat.id)
- Never trust incoming data
- Always log errors
- Always return HTTP 200 to Telegram

---

## 12. Next.js Rules

### Rendering

- Server Components by default
- Client Components only when needed

Use client ONLY for:
- interactivity
- buttons
- dynamic UI

---

### Data Fetching

- fetch data directly from Supabase
- keep logic simple
- no complex caching strategies

---

### State Management

❌ Forbidden:
- Zustand
- Redux
- global state

Reason:
- data already lives in Supabase
- project is simple

### Frontend Structure Rules

Scope:
- Global rules apply to the entire repository.
- Feature-specific rules must live inside the feature or app they belong to.
- Do not promote feature patterns to global rules without clear cross-feature reuse.

MUST:
- In Next.js App Router, `page.tsx` must act as an orchestration/composition layer.
- `page.tsx` is responsible for data fetching, guards, redirects, params, and composition.
- Repeated layout or view structure across pages must be extracted from `page.tsx`.
- Use local `_components` and `_lib` when code belongs only to one page or one route branch.
- Move code higher only after real reuse across multiple scenarios.
- Do not move code into `shared` prematurely. `shared` is only for truly cross-domain primitives.
- Naming conventions must be consistent:
  - UI components: `PascalCase`
  - helpers/actions/utils: `camelCase`
  - folders and files: `kebab-case`

SHOULD:
- Extract a UI pattern only when it repeats with the same role, not only because classes look similar.
- Before creating a shared component, verify that the duplication is structural and repeated at least 2-3 times.
- Keep route-local code close to the route until there is a clear reuse case.

---

## 13. Project Structure (Light FSD)

Use simplified FSD (no overengineering):

src/
app/
entities/
message/
shared/
lib/

Rules:

- no deep layering
- no complex feature slicing
- keep structure flat and clear

---

## 14. Coding Style

- camelCase for variables and functions
- async/await preferred over then()
- simple and readable code
- minimal nesting

Error handling:
- always log errors
- do not ignore failures

---

## 15. Anti-Overengineering Rules

❌ Do NOT:

- introduce complex abstractions
- create additional layers
- split logic unnecessarily
- optimize prematurely

---

## 16. When User Makes a Bad Decision

Agent MUST:

1. Clearly say it's a bad decision
2. Explain why
3. Provide better alternative

Example behavior:

Это плохое решение, потому что:
- ...
- ...

Лучше сделать так:
- ...

---

## 17. When Suggesting Improvements

Agent MAY:

- suggest better architecture
- suggest optimizations
- suggest patterns

BUT:

❗ MUST NOT implement without "go"

---

## 18. Output Strategy

Default mode:

- explanation
- reasoning
- options

Code mode:

- ONLY after "go"

---

## 19. Priority Order

When making decisions:

1. Simplicity
2. Clarity
3. Learning value
4. Best practices (only if not overcomplicating)

---

## 20. MCP / Serena Usage (Optional)

Use MCP (Serena) ONLY when necessary.

✅ Allowed:

* navigating large codebase
* finding usages across files
* understanding complex dependencies

❌ Do NOT use MCP:

* for simple questions
* for learning basics
* when codebase is small and clear

Rule:
If the problem can be understood without MCP → do NOT use it.

Goal:

* preserve learning process
* avoid over-reliance on tools

---

# 🔥 TL;DR

- не пиши код без "go"
- не усложняй
- Deno ≠ Node.js
- Supabase напрямую, без abstraction
- Server Components first
- Zustand нельзя
- валидируй входящие данные
- если пользователь ошибается — скажи прямо и объясни
