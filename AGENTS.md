# AGENTS.md — IGANO Project 


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

Default to:

- shadcn/ui (UI)
- native `<form action={...}>` submission
- React 19 `useActionState` for server result state
- React 19 `useFormStatus` for pending UI
- Zod (validation)
- Server Actions (submission)

Use React Hook Form ONLY when the form is genuinely client-heavy, for example:

- complex client-side field arrays
- advanced controlled widgets
- rich conditional UX that native forms do not handle cleanly

## Pattern

- Server Action is the source of truth
- Zod validates on the server always
- `useActionState` handles returned form state
- `useFormStatus` handles pending/disabled UI
- native inputs are preferred over legacy submit handlers

Never rely only on client validation.
Never default to `onSubmit + startTransition` for ordinary forms when a form action will do.

---

# 8A. React 19 Rules

This project should prefer modern React 19 patterns over legacy client-form patterns.

Preferred defaults:

- use `useActionState` for mutation forms
- use `useFormStatus` for submit/loading states
- use `useOptimistic` when latency would otherwise make the UI feel stale
- use `useEffectEvent` instead of stale-closure effect workarounds
- use `use` where async resource consumption is naturally expressed that way
- write React Compiler-friendly code

React Compiler guidance:

- do not scatter `useMemo` and `useCallback` defensively
- prefer straightforward render logic unless profiling proves otherwise
- avoid manual memoization that fights the compiler

Avoid as a default:

- RHF for simple forms
- imperative `onSubmit` handlers for standard mutations
- `useTransition` as a substitute for form actions in ordinary submit flows
- legacy patterns that duplicate server-action behavior on the client

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
# 13A. MCP and shadcn Preference Rule

For this repo, Codex should proactively use the configured MCP servers when relevant:

- Use **Next.js MCP** for Next.js runtime inspection, route/runtime diagnostics, and page verification
- Use **shadcn MCP** for component discovery, registry lookup, examples, and add commands

UI component rule:

- If **shadcn/ui** already has the needed component or pattern, prefer that component first
- Do not build a custom replacement when a suitable shadcn component already exists unless there is a clear project-specific reason
- When introducing a new UI primitive, check shadcn MCP/registry first

This is a strong default, not an excuse to ignore existing local code. Reuse current project patterns where appropriate.

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
- pnpm ts-check
- pnpm lint:ts
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

# 21. Editing Strategy on Windows (IMPORTANT)

On this project, Codex should avoid wasting time on repeated patch attempts when editing files on Windows.

Rules:
- Prefer direct file rewrites for small/medium files when a change is clear.
- Default to direct rewrite first instead of trying sandbox patch tooling first.
- Use apply_patch only when there is a strong reason and the edit is unusually safe for that tool path.
- If a patch/apply_patch attempt fails once, DO NOT retry the same patch flow repeatedly.
- Immediately switch to one of these:
  1. rewrite the full target file
  2. rewrite only the affected section using direct file write
  3. output an exact copy-paste diff for manual application if file write is unsafe
- Do not spend multiple turns re-attempting the same sandbox patch mechanism.
- When changing several files, edit them one-by-one instead of one huge batch.
- Prefer minimal deterministic edits over clever patching.

Reason:
- Patch tooling may fail at the Windows sandbox/tool-setup layer even when the code itself is correct.
- In this repo, successful fallback has been direct file writing after patch failure.
- Direct rewrite is the preferred default because it avoids burning time and credit on a tool path that fails frequently here.

# 22. Command Execution Rule

When working in this repo on Windows:

- Avoid long inline PowerShell mutation commands when possible.
- Prefer normal file writes over long pwsh -Command one-liners.
- Avoid generating edit strategies that depend on fragile line-number insertion.
- Prefer replacing a clearly identified component/function/block by content, not by approximate line offsets.


# 23. Failure Escalation Rule

If an edit tool fails because of sandbox/tooling and not code correctness:

- Treat it as an environment issue, not a coding issue.
- Do not re-investigate unrelated app code unless there is a real compile/runtime error.
- Switch immediately to the next editing method.
- After edits, validate with:
  - pnpm ts-check
  - pnpm build

# 24. Validation Efficiency Rule

To avoid wasting time and burning unnecessary credit:

- Do NOT automatically run `pnpm build` after every successful `pnpm ts-check`.
- Default validation should be `pnpm ts-check` only.
- Run `pnpm build` only when it is actually justified, for example:
  - route-level/server-component changes that may fail only at build time
  - Next.js config/runtime integration changes
  - changes affecting static generation, dynamic rendering, metadata, or bundling behavior
  - when the user explicitly asks for a build verification
- For ordinary component/form/copy/client-state changes, stop at `pnpm ts-check` unless there is a concrete reason to do more.
- If `pnpm build` is skipped, say so briefly in the final response when relevant.
