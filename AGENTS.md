# AGENTS.md — IGAHO Project 


It provides **strong architectural guidance** while allowing flexibility during development.

---

# 1. Core Philosophy

This project uses:

- **Next.js (App Router) as a FULL-STACK framework**
- **Prisma** for database access
- **Auth.js** for authentication
- **Server Actions** for most mutations
- **Zod** for validation
- **shadcn/ui** for UI
- **lucide-react** for icons

There is **NO separate frontend/backend split**.

---

# 2. Flexibility Rule (IMPORTANT)

This document defines **preferred defaults**, not rigid rules.

Codex MUST:

- Follow these defaults when creating new features
- Follow existing local patterns if already established
- Avoid forcing unnecessary structure
- Avoid generating unused folders/files
- Explain any intentional deviation briefly

---

# 3. Non-Negotiable Rules

These should almost never be violated:

- Use **Next.js as full-stack**
- Use **Server Actions for writes**
- Use **Server Components for data fetching**
- Keep **page.tsx thin**
- Use **Prisma (centralized client)**
- Use **Auth.js (centralized config)**
- Use **Zod for validation**
- Use **shadcn/ui for UI**
- Use **lucide-react for icons**
- Never trust frontend-only validation

---

# 4. Project Structure (Preferred, NOT mandatory)

```text
app/
components/
features/
lib/
prisma/
types/
```

## Key idea

- `app/` → routing + page composition
- `components/` → reusable UI
- `features/` → domain logic (preferred)
- `lib/` → shared utilities
- `prisma/` → database schema

---

# 5. Routing Rules

- `/` = **Login page**
- No public marketing pages
- Protected routes under `/dashboard`

Use route handlers ONLY for:

- Auth.js
- webhooks
- external integrations

---

# 6. Page Rules

Top-level `page.tsx` should:

- fetch data (server-side)
- check auth/permissions
- pass props to components

DO NOT:

- put business logic inside pages
- perform mutations inside pages
- create large complex JSX trees

---

# 7. Server Actions (Default Mutation Pattern)

All writes should go through Server Actions unless justified.

Server Action MUST:

1. Validate with Zod
2. Check auth/permissions
3. Call Prisma
4. Return structured result
5. Trigger revalidation/redirect if needed

---

# 8. Forms Strategy

Use:

- shadcn/ui (UI)
- React Hook Form (UX + field state)
- Zod (validation)
- Server Actions (submission)

## Pattern

- RHF handles inputs
- Zod validates (client + server)
- Server Action = source of truth

Never rely only on client validation.

---

# 9. Feature Structure (Flexible)

Preferred:

```text
features/<feature>/
  components/
  actions/
  schemas/
  utils/
  queries/ (optional)
```

BUT:

- Do NOT force this if unnecessary
- Small features can colocate logic
- Queries folder is optional

---

# 10. Data Fetching

Preferred:

- Fetch in **Server Components**
- Use helpers when logic grows
- Avoid duplicate queries in multiple components

---

# 11. Auth Rules

- Use Auth.js
- Centralize config
- Protect routes consistently
- Reuse helpers

Always consider:

- session
- redirects
- permissions

---

# 12. Prisma Rules

- Single Prisma client instance
- No scattered queries
- Update schema + usage together

---

# 13. UI Rules

- Use shadcn/ui
- Keep UI consistent
- Extract reusable components
- Avoid duplication

---

# 14. Icon Rule

- Use **lucide-react ONLY**
- Do not use Bootstrap Icons
- Avoid mixing icon libraries

---

# 15. Do NOT Over-Scaffold

Codex MUST NOT:

- create unused routes
- generate empty folders
- scaffold future features prematurely

Only build what is needed NOW.

---

# 16. Minimal Change Rule

When editing:

- Keep changes small
- Avoid breaking working code
- Do not refactor unrelated parts

---

# 17. Debugging Rule

When fixing an issue:

1. Identify entry point (form/page/action)
2. Trace validation
3. Check auth
4. Check Prisma
5. Provide exact fix

---

# 18. Commands

Use pnpm ONLY:

- pnpm dev
- pnpm build
- pnpm prisma migrate dev
- pnpm prisma generate

---

# 19. Security

- Never expose secrets
- Use env variables
- Protect sensitive actions
- Validate ALL inputs server-side

---

# 20. Final Rule

Codex should:

- prioritize clarity over cleverness
- follow existing patterns
- avoid overengineering
- deliver minimal, correct solutions
