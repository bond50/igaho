ALTER TABLE "ApplicationPortalSetting"
  ADD COLUMN IF NOT EXISTS "is_c2b_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "c2b_short_code" TEXT,
  ADD COLUMN IF NOT EXISTS "c2b_validation_url" TEXT,
  ADD COLUMN IF NOT EXISTS "c2b_confirmation_url" TEXT,
  ADD COLUMN IF NOT EXISTS "c2b_response_type" TEXT,
  ADD COLUMN IF NOT EXISTS "c2b_registered_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "c2b_last_registration_note" TEXT;

CREATE TABLE IF NOT EXISTS "MpesaC2BReceipt" (
  "id" TEXT NOT NULL,
  "application_id" TEXT,
  "user_id" TEXT,
  "short_code" TEXT,
  "bill_ref_number" TEXT,
  "invoice_number" TEXT,
  "org_account_balance" TEXT,
  "third_party_trans_id" TEXT,
  "msisdn" TEXT NOT NULL,
  "first_name" TEXT,
  "middle_name" TEXT,
  "last_name" TEXT,
  "trans_id" TEXT NOT NULL,
  "trans_amount" INTEGER NOT NULL,
  "transaction_type" TEXT,
  "trans_time" TIMESTAMP(3),
  "is_validated" BOOLEAN NOT NULL DEFAULT true,
  "validation_result_code" TEXT,
  "validation_result_desc" TEXT,
  "raw_payload" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MpesaC2BReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MpesaC2BReceipt_trans_id_key" ON "MpesaC2BReceipt"("trans_id");
CREATE INDEX IF NOT EXISTS "MpesaC2BReceipt_application_id_idx" ON "MpesaC2BReceipt"("application_id");
CREATE INDEX IF NOT EXISTS "MpesaC2BReceipt_user_id_idx" ON "MpesaC2BReceipt"("user_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MpesaC2BReceipt_application_id_fkey'
  ) THEN
    ALTER TABLE "MpesaC2BReceipt"
      ADD CONSTRAINT "MpesaC2BReceipt_application_id_fkey"
      FOREIGN KEY ("application_id") REFERENCES "MembershipApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MpesaC2BReceipt_user_id_fkey'
  ) THEN
    ALTER TABLE "MpesaC2BReceipt"
      ADD CONSTRAINT "MpesaC2BReceipt_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
