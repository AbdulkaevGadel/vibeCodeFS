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

# 🔥 TL;DR

- не пиши код без "go"
- не усложняй
- Deno ≠ Node.js
- Supabase напрямую, без abstraction
- Server Components first
- Zustand нельзя
- валидируй входящие данные
- если пользователь ошибается — скажи прямо и объясни