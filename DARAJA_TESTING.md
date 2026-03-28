# Daraja Testing Guide

This guide is for the payment flow currently built in this project.

It explains:
- what each payment mode means
- how to configure Daraja locally
- how to test applicant and admin flows
- how to understand the payment operations page
- how to confirm whether a payment truly succeeded, failed, timed out, or still needs follow-up

## 1. Understand The Two Payment Modes

The portal currently supports two main collection modes:

### Manual proof upload
Use this when applicants pay outside the portal and then upload proof.

Applicant experience:
- sees the configured fee and tax summary
- sees manual payment instructions from admin settings
- enters transaction reference
- uploads proof
- submits for admin review

Admin experience:
- reviews the uploaded proof
- approves or rejects the application
- can manually record or verify the payment in the ledger

### M-Pesa Daraja (STK push)
Use this when the applicant should trigger an STK prompt from the portal.

Applicant experience:
- sees fee, tax, total payable, business name, paybill, and phone to be charged
- clicks `Start STK push`
- completes the M-Pesa prompt on the phone
- waits for success or failure state
- submits the application only after payment is verified

Admin experience:
- can test STK from `/dashboard/settings`
- can monitor requests and exceptions from `/dashboard/payments`
- can reconcile, resend STK, or manually verify when needed

## 2. Required Daraja Inputs

For the current STK flow you need:

```env
DARAJA_ENVIRONMENT=sandbox
DARAJA_CONSUMER_KEY=...
DARAJA_CONSUMER_SECRET=...
DARAJA_PASSKEY=...
DARAJA_CALLBACK_URL=https://your-ngrok-url.ngrok-free.app/api/payments/mpesa/callback
```

Important:
- `short code`, `paybill`, and transaction type are controlled from admin settings in the app
- `DARAJA_CALLBACK_URL` must be public
- if the ngrok URL changes, update the env value and restart the app

For deeper verification flows, you may also use:

```env
DARAJA_INITIATOR_NAME=...
DARAJA_SECURITY_CREDENTIAL=...
DARAJA_TRANSACTION_STATUS_RESULT_URL=https://your-ngrok-url.ngrok-free.app/api/payments/mpesa/transaction-status/result
DARAJA_TRANSACTION_STATUS_TIMEOUT_URL=https://your-ngrok-url.ngrok-free.app/api/payments/mpesa/transaction-status/timeout
```

## 3. Local Setup

### Start the app

```powershell
pnpm dev
```

### Expose localhost using ngrok

```powershell
ngrok http 3000
```

Take the public URL and place it in:

```env
DARAJA_CALLBACK_URL=https://your-ngrok-url.ngrok-free.app/api/payments/mpesa/callback
```

Then restart `pnpm dev`.

## 4. Configure The Portal In Admin Settings

Open:
- `/dashboard/settings`

Set these first:
- active payment collection mode
- application fee
- tax enabled or disabled
- tax percentage if tax is enabled
- manual instructions if manual mode is selected
- M-Pesa business name
- paybill number
- Daraja short code
- Daraja transaction type

Good rule:
- if testing manual proof, select `Manual proof upload`
- if testing STK push, select `M-Pesa Daraja`

## 5. What The Main Admin Payment Actions Mean

### Run reconciliation
This rechecks payment requests that are still unresolved.

It can:
- ask Daraja for current status
- update stale request records
- move requests into success, timeout, failed, or verified states
- reduce callback-only uncertainty

Use it when:
- callback seems delayed
- status looks stuck
- applicant says they paid but the portal has not updated yet

### Resend STK
This sends a fresh M-Pesa prompt using the same request details.

Use it when:
- the phone never got the prompt
- the prompt expired
- the user dismissed the STK prompt
- the user wants to retry immediately

Do not use it if:
- the payment is already confirmed successful

### Manually verify successful payment
This tells the system to accept a payment as verified when admin has enough evidence.

Use it when:
- you have a valid receipt number
- Daraja success is known but callback evidence is incomplete
- reconciliation confirms success but the normal lock/ledger path needs help

Do not use it casually. It is an admin override.

### Mark for manual follow-up
This creates an operational flag/incident so the case is not forgotten.

Use it when:
- payment result is unclear
- callback is missing
- applicant claims payment was made outside the usual flow
- you need a human review trail

## 6. Understand The Payment Exception Cards

Open:
- `/dashboard/payments`

These top cards are not random counters. They each represent a category of operational work.

### Awaiting callback too long
Meaning:
- STK request started
- it is still waiting longer than expected
- callback may be delayed, missed, or the payer never completed the prompt

Typical admin action:
- run reconciliation
- if still unresolved, resend STK or mark for manual follow-up

### Callback missing but possibly paid
Meaning:
- system has reason to believe the payment succeeded
- but the original callback payload is missing or incomplete

Typical admin action:
- inspect receipt and verification source
- manually verify if evidence is strong

### Failed, cancelled, or expired intents
Meaning:
- payment did not complete successfully
- applicant may have cancelled, timed out, used wrong PIN, or ignored the prompt

Typical admin action:
- ask applicant to retry
- resend STK
- only manually verify if you later confirm payment actually succeeded through another signal

### Verified but not locked
Meaning:
- money appears confirmed
- but it has not attached to a fully submitted application record yet

Common cause:
- applicant paid but did not finish submission
- submission failed validation after payment

Typical admin action:
- review the application state
- follow up with the applicant if needed

### Unmatched C2B confirmations
Meaning:
- paybill confirmation came in from Daraja
- the system could not link it to any application automatically

Typical admin action:
- search by bill reference, transaction ID, or payer phone
- manually review where that payment belongs

### Open incidents
Meaning:
- payment operations alerts created by the system or by admin actions
- these are your follow-up queue and audit trail

Typical admin action:
- review the detail
- resolve when handled

## 7. How To Test Admin STK Push

Open:
- `/dashboard/settings`

In the Daraja sandbox panel:

1. Enter a Safaricom number in `2547XXXXXXXX` format.
2. Use a small amount like `1` when sandbox testing.
3. Enter an account reference like `IGA-TEST-001`.
4. Add a short transaction description.
5. If needed, link it to a real application from the application selector.
6. Click `Send sandbox STK push`.

Expected result:
- a new request appears in recent Daraja requests
- request gets a `MerchantRequestID`
- request gets a `CheckoutRequestID`
- request enters a live waiting state

Then watch for:
- success
- failed
- cancelled
- timeout
- receipt number on success

## 8. How To Test Applicant STK Push

Prerequisites:
- active mode is `M-Pesa Daraja`
- form is open
- intake is enabled
- fee and Daraja details are configured

Steps:
1. Open `/apply`.
2. Go to the payment step.
3. Confirm the portal shows the right fee, tax, total, paybill, and business name.
4. Enter the payer phone number.
5. Click `Start STK push`.
6. Complete the prompt on the phone.
7. Wait for the payment state to update.
8. Submit the application only after payment is verified.

Expected applicant-side visibility:
- exact amount breakdown
- payer phone being charged
- live status updates
- human-friendly failure reason
- retry button when needed
- verify payment button when callback looks delayed
- payment intent state such as created, awaiting payment, verified, or locked

## 9. How To Test Manual Proof Mode

Switch the portal to `Manual proof upload` in `/dashboard/settings`.

Then:
1. Open `/apply`.
2. Confirm the applicant sees manual payment instructions.
3. Confirm the fee and tax summary still looks correct.
4. Enter transaction reference.
5. Upload proof.
6. Submit the application.
7. Review from `/dashboard/applications/[applicationId]`.

Expected result:
- proof is visible to admin
- amounts are still stored correctly
- admin can approve, reject, or manually record the payment outcome

## 10. How To Verify A Payment Properly

There are multiple layers. Do not rely on only one.

### Layer A: Daraja accepted the request
Check the request row for:
- `MerchantRequestID`
- `CheckoutRequestID`
- `CustomerMessage`

That confirms Daraja accepted the initiation.

### Layer B: Callback or verification updated the request
Check for:
- `ResultCode`
- `ResultDesc`
- `MpesaReceiptNumber` on success
- verification source

That confirms the request has moved beyond simple initiation.

### Layer C: Payment intent state changed correctly
The payment intent should move through states like:
- created
- awaiting payment
- verified
- locked

This is the business-level truth for whether the application can proceed.

### Layer D: Member payment ledger updated
Check:
- `/dashboard/payments`
- admin review page for the application

The ledger should show:
- collection mode
- provider/payment method
- payer phone
- amount and tax
- verification status
- receipt or provider reference when available

## 11. Common Failure Meanings

### Timeout / no response
Meaning:
- user did not act on the prompt in time
- phone/network issue
- STK prompt not completed

What to do:
- retry or resend STK

### Cancelled
Meaning:
- user dismissed or cancelled the prompt

What to do:
- retry when ready

### Wrong PIN or invalid initiator/configuration message
Meaning:
- either payer entered wrong PIN
- or Daraja config is incorrect, depending on the raw message

What to do:
- if user-side, retry carefully
- if config-side, inspect shortcode, passkey, and portal settings

### Callback missing but payment may have succeeded
Meaning:
- do not assume failure immediately
- use reconciliation and receipts before deciding

## 12. Recommended Testing Sequence

Use this order when testing locally:

1. configure Daraja env vars
2. start `pnpm dev`
3. start `ngrok http 3000`
4. update callback URL
5. save admin payment settings
6. test admin sandbox STK push
7. confirm request log updates
8. test applicant STK push from `/apply`
9. confirm payment intent and request states
10. submit the application after payment verification
11. review the application as admin
12. check `/dashboard/payments` for ledger and exception behavior
13. test one failure path deliberately
14. test resend STK
15. test reconciliation
16. test manual verify only when you have a strong success signal

## 13. Useful Screens During Testing

Use these together:
- `/dashboard/settings`
  - Daraja config and admin STK testing
- `/apply`
  - applicant payment flow
- `/dashboard/payments`
  - exception operations and ledger
- `/dashboard/applications/[applicationId]`
  - linked application review, payment intent lifecycle, C2B confirmations, ledger

## 14. Local Troubleshooting

### I changed env vars but nothing changed
Do this:
- restart `pnpm dev`

### I get stale Prisma runtime errors
Do this:
- restart `pnpm dev`

### Callback is not arriving
Check:
- ngrok is running
- callback URL exactly matches current ngrok URL
- app restarted after env change

### Payment looks stuck
Use:
- `Run reconciliation`
- then inspect exception buckets

### Applicant says they paid but portal disagrees
Check in order:
1. latest request status
2. receipt number
3. verification source
4. payment intent status
5. exception queue
6. only then consider manual verification

## 15. Official References

- Safaricom Daraja portal: https://developer.safaricom.co.ke/
- STK Push docs: https://developer.safaricom.co.ke/docs/mpesa/stk-push
- Transaction Status API: https://developer.safaricom.co.ke/APIs/TransactionStatus
- C2B Register URL API: https://developer.safaricom.co.ke/APIs/CustomerToBusinessRegisterURL/
- Test credentials: https://developer.safaricom.co.ke/test_credentials
- ngrok docs: https://ngrok.com/docs/getting-started/
