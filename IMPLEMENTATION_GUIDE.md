# Implementation Guide

This file is the working implementation guide for the membership system. It reflects the current build state, the agreed phase names, and the active implementation target so future changes do not drift.

## Purpose

- Keep implementation aligned with the proposal and registration form documents in `extra/docs/`
- Separate already-built workflow work from the next active phase
- Record what is already complete so planning discussions stay grounded in the real codebase
- Define the next highest-value move before adding new scope

## Phase Names

### Phase 1: Authentication Foundation

This phase is complete enough for current project needs.

It covers:

- account registration
- login
- email verification
- OTP / 2FA verification
- route protection
- admin role handling
- password reset and account recovery
- modern React 19 action-based auth forms

### Phase 2: Registration And Management Core

This phase is operationally complete enough for the current system.

It covers:

- short signup followed by `/apply`
- multi-step application flow
- server-backed `DRAFT` saving and autosave
- reusable applicant profile data
- manual payment proof upload
- admin review dashboard
- approve / reject workflow
- rejection notes and revision flow
- application settings and readiness checks
- reporting, filtering, analytics, and exports
- notifications

### Phase 3: Member Portal

This phase is now complete enough for the current scope.

It covers:

- richer approved-member experience
- dedicated member dashboard after approval
- membership ID generation on approval
- digital certificate
- digital membership card
- member payment history timeline
- manual member payment recording before live API integration
- member self-service profile access inside the portal

### Phase 4: Payment Integration And Advanced Automation

This is now the active delivery phase.

Primary direction for this phase:

- M-Pesa Daraja first
- Paybill support
- STK push support

Other payment methods should remain labeled as coming soon until this phase starts.

Expected scope:

- M-Pesa Daraja integration
- paybill and STK push flows
- automatic payment confirmation
- webhook handling
- finance reconciliation
- richer notification automation
- other payment methods moved from `coming soon` only after they are truly implemented

## Current Scope

The active target is now Phase 4 payment integration, not more Phase 3 portal scaffolding.

For now, payment handling still means:

- applicant pays outside the system
- applicant enters transaction reference
- applicant uploads proof of payment
- admin manually verifies the proof
- admins can add manual member payment records so the member portal shows a real history

That remains the source of truth until the team explicitly completes Phase 4.

## Current Build State

The following are already implemented in the codebase.

### Completed Or Working

- brief auth-only registration flow
- verified-user flow into `/apply`
- login through modern action forms with server-side validation
- password reset request and completion flows
- 2FA challenge flow using action-state patterns
- multi-step application form
- county, sub-county, and ward dependent selects from canonical Kenya location data
- application `DRAFT`, `PENDING`, `ACTIVE`, and `REJECTED` lifecycle
- autosave to server-backed drafts
- reusable applicant profile cache that prefills `/apply`
- dedicated signed-in profile page for editable user details
- duplicate protection for key fields like ID number, phone number, and email at application level
- admin-managed membership categories
- admin-managed application portal open / close controls
- application readiness gate on `/apply`
- admin application review page with approval and rejection actions
- review notes, rejection reason, flagged sections, and flagged fields
- rejected application revision flow back into draft
- payment proof history preservation on replacement
- county reporting in the dashboard
- category reporting in the dashboard
- reviewer workload, turnaround, rejection, and resubmission analytics
- dashboard queue filtering, search, sorting, saved views, and pagination
- CSV exports for queue, category, and analytics reporting
- email notifications for submit / approve / reject
- runtime-verified critical auth and apply flows
- generated membership ID on approval
- approved-member dashboard experience
- printable digital certificate
- printable membership card
- member payment history page
- manual payment recording for approved members

### Intentionally Not Editable On Profile

These stay controlled on the application or auth side and should not be changed from the profile page:

- email
- names and identity details
- ID number
- membership category and membership type
- payment details and proof
- declarations and signed submission details
- review outcome fields
- generated membership ID once assigned

## Phase 2 Status Against Original Order

1. brief `/auth/register` flow: complete
2. `DRAFT` support: complete
3. `/apply` multi-step flow: complete
4. server-side draft save: complete
5. final submit to `PENDING`: complete
6. payment proof upload: complete
7. admin pending/review page: complete
8. approve / reject actions: complete
9. status-aware access control: complete
10. simple reports: complete
11. notifications: complete
12. reusable applicant profile editing: complete
13. operational analytics and exports: complete

## Phase 3 Status

1. approved-member dashboard/home: complete
2. membership ID display and generation: complete
3. certificate generation: complete
4. membership card generation: complete
5. payment history timeline: complete
6. member self-service profile access: complete
7. manual payment history recording before Daraja: complete

## Phase 4 Active Scope

### 1. Real Payment Integration

Build:

- M-Pesa Daraja integration
- paybill support
- STK push request flow
- secure callback handling
- transaction verification against the member/application record

### 2. Payment Experience Rules

Until live integration is complete:

- keep `M-Pesa` as the real direction
- label other payment methods as `coming soon` in any user-facing payment UX
- do not imply card or bank APIs are implemented when they are not

### 3. Payment Data And Reconciliation

Phase 4 should also cover:

- authoritative payment records from Daraja callbacks
- reconciliation between submitted references and confirmed transactions
- finance/admin visibility into confirmed vs pending vs failed payments
- notification triggers based on real payment status

## Recommended Data Model Direction

Continue treating membership workflow separately from authentication.

Preferred direction:

- `User`
  - authentication identity
  - role
  - login-related fields

- `MembershipApplication`
  - applicant-submitted registration data
  - payment reference
  - payment proof file path or URL
  - review status
  - generated membership ID after approval
  - rejection reason
  - review notes
  - flagged fields and sections
  - reviewer
  - timestamps

- `ApplicationDraft`
  - in-progress application state

- `ApplicantProfile`
  - reusable editable profile data used to prefill future application work

- `MembershipPaymentRecord`
  - member-facing payment history before and after API integration
  - manual entries for the current phase
  - later Daraja-confirmed entries in Phase 4

- supporting admin-managed configuration
  - membership categories
  - portal settings

Keep the design minimal. Only add normalization when it clearly helps the active phase.

## Next Move

The next active implementation move is the first real Phase 4 slice.

### Recommended Next Step

Build:

- M-Pesa Daraja paybill integration
- STK push initiation flow
- secure callback route and transaction verification
- member/application payment confirmation updates from real M-Pesa events

Why this is next:

- Phase 3 member portal scope is now covered end to end
- the proposal explicitly points to M-Pesa API work as the next optional phase
- the system already has manual payment proof review and member payment history, which gives a clean bridge into Daraja-backed confirmation
- Phase 4 is now the highest-value missing capability

## Constraints

Follow the project defaults from `AGENTS.md`:

- Next.js full-stack only
- Server Actions for writes
- Server Components for data fetching
- Zod validation on the server
- Prisma as centralized data access
- shadcn/ui for UI
- lucide-react for icons
- React 19-first form and state patterns
- minimal, correct changes

## Decision Rule

If future work conflicts with this guide:

- phase naming in this file takes precedence for planning discussions
- active phase in this file should be updated before adding major new scope
- implementation should still follow existing local code patterns
