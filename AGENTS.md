# AGENTS.md — IGANO Project

This document defines how Codex should behave when working on this project.

It provides strong architectural guidance while ensuring:
- reliable deployments
- predictable Prisma behavior
- minimal production surprises

---

# 1. Core Philosophy

This project uses:

- Next.js (App Router) as FULL-STACK
- Prisma for database
- Auth.js for auth
- Server Actions for writes
- Zod for validation
- shadcn/ui for UI
- lucide-react for icons

There is NO frontend/backend split.

---

# 2. Flexibility Rule (IMPORTANT)

These are defaults, not rigid rules.

Codex MUST:
- follow these defaults for new features
- follow existing patterns if already present
- avoid unnecessary restructuring
- avoid unused files/folders
- explain deviations briefly

---

# 3. Non-Negotiable Rules

- Use Server Actions for mutations
- Use Server Components for data fetching
- Keep page.tsx thin
- Use Prisma (single client)
- Use Auth.js centrally
- Use Zod validation ALWAYS
- Never trust client validation alone

---

# 4. Project Structure (Preferred)

app/
components/
features/
lib/
prisma/
types/

---

# 5. Routing Rules

- `/` = login page
- `/dashboard` = protected routes
- No marketing/public pages

Use route handlers ONLY for:
- auth
- webhooks
- external integrations

---

# 6. Page Rules

page.tsx should:
- fetch data
- check auth
- pass props

DO NOT:
- mutate data
- contain business logic

---

# 7. Server Actions

All writes MUST:

1. Validate with Zod
2. Check auth
3. Call Prisma
4. Return structured result
5. Revalidate/redirect

---

# 8. Forms

Default:
- native `<form action={...}>`
- useActionState
- useFormStatus
- Zod validation

Avoid RHF unless truly needed.

---

# 9. Data Fetching

- Server Components ONLY
- Avoid duplicate queries

---

# 10. Auth

- Centralized Auth.js config
- Always enforce session + permissions

---

# 11. Prisma (CRITICAL — PRODUCTION RULES)

## 11.1 Absolute Rules

Codex MUST:

- NEVER use `prisma db push` for production workflows
- NEVER suggest `db push` as a deployment solution
- ALWAYS use Prisma migrations for schema changes

---

## 11.2 Development Workflow (MANDATORY)

When schema changes:

1. Update `prisma/schema.prisma`
2. Run:

   ```bash
   pnpm prisma migrate dev --name <change-name>