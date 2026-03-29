-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('DRAFT', 'PENDING', 'ACTIVE', 'REJECTED');

-- CreateEnum
CREATE TYPE "MembershipType" AS ENUM ('NEW_APPLICATION', 'RENEWAL', 'UPGRADE');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('MPESA', 'BANK_TRANSFER', 'CARD');

-- CreateEnum
CREATE TYPE "PaymentPurpose" AS ENUM ('APPLICATION_FEE', 'ANNUAL_RENEWAL');

-- CreateEnum
CREATE TYPE "PaymentCollectionMode" AS ENUM ('MANUAL_PROOF', 'MPESA_DARAJA');

-- CreateEnum
CREATE TYPE "RenewalMode" AS ENUM ('MANUAL_REVIEW', 'PAY_AND_ACTIVATE');

-- CreateEnum
CREATE TYPE "RenewalReminderFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "ApplicationReviewMode" AS ENUM ('MANUAL_REVIEW', 'AUTO_APPROVE_VERIFIED_PAYMENTS');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('MANUAL', 'MPESA_DARAJA');

-- CreateEnum
CREATE TYPE "MemberPaymentStatus" AS ENUM ('VERIFIED', 'PENDING', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentIntentStatus" AS ENUM ('CREATED', 'AWAITING_PAYMENT', 'VERIFIED', 'FAILED', 'CANCELLED', 'EXPIRED', 'LOCKED');

-- CreateEnum
CREATE TYPE "PaymentVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED', 'MANUAL_REVIEW');

-- CreateEnum
CREATE TYPE "PaymentVerificationSource" AS ENUM ('CALLBACK', 'STK_QUERY', 'TRANSACTION_STATUS_QUERY', 'TRANSACTION_STATUS_CALLBACK', 'MANUAL_ADMIN', 'MANUAL_RECORDED', 'C2B_CONFIRMATION', 'RECONCILIATION_JOB');

-- CreateEnum
CREATE TYPE "PaymentIncidentSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "PaymentIncidentStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "MpesaStkStatus" AS ENUM ('INITIATED', 'AWAITING_CALLBACK', 'CALLBACK_RECEIVED', 'SUCCESS', 'VERIFIED', 'FAILED', 'CANCELLED', 'TIMEOUT');

-- CreateEnum
CREATE TYPE "MpesaReconciliationSource" AS ENUM ('CALLBACK', 'AUTO_POLL', 'MANUAL_VERIFY', 'STK_QUERY', 'TRANSACTION_STATUS_QUERY', 'TRANSACTION_STATUS_CALLBACK', 'TIMEOUT_HANDLER', 'RECONCILIATION_JOB');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "email_verified" TIMESTAMP(3),
    "password" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isTwoFAEnabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_intents" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "purpose" "PaymentPurpose" NOT NULL DEFAULT 'APPLICATION_FEE',
    "application_id" TEXT,
    "membership_application_id" TEXT,
    "billing_year" INTEGER,
    "collection_mode" "PaymentCollectionMode" NOT NULL DEFAULT 'MPESA_DARAJA',
    "provider" "PaymentProvider" NOT NULL DEFAULT 'MPESA_DARAJA',
    "paymentMethod" "PaymentMethod" NOT NULL,
    "account_reference" TEXT NOT NULL,
    "provider_reference" TEXT,
    "payer_phone_number" TEXT,
    "base_amount" INTEGER NOT NULL,
    "tax_amount" INTEGER NOT NULL,
    "total_amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "status" "PaymentIntentStatus" NOT NULL DEFAULT 'CREATED',
    "verification_status" "PaymentVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verification_source" "PaymentVerificationSource",
    "callback_payload" JSONB,
    "reconciliation_payload" JSONB,
    "payment_initiated_at" TIMESTAMP(3),
    "callback_received_at" TIMESTAMP(3),
    "last_verified_at" TIMESTAMP(3),
    "last_error" TEXT,
    "verified_at" TIMESTAMP(3),
    "locked_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "mpesa_receipt_number" TEXT,
    "checkout_request_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_notification_states" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "last_read_at" TIMESTAMP(3),
    "dismissed_notification_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_notification_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_drafts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "current_step" INTEGER NOT NULL DEFAULT 0,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applicant_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applicant_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_portal_settings" (
    "id" TEXT NOT NULL,
    "singleton_key" TEXT NOT NULL DEFAULT 'default',
    "setup_name" TEXT,
    "short_name" TEXT,
    "is_form_open" BOOLEAN NOT NULL DEFAULT false,
    "is_accepting_applications" BOOLEAN NOT NULL DEFAULT false,
    "show_application_form_after_approval" BOOLEAN NOT NULL DEFAULT false,
    "application_review_mode" "ApplicationReviewMode" NOT NULL DEFAULT 'MANUAL_REVIEW',
    "renewals_enabled" BOOLEAN NOT NULL DEFAULT false,
    "renewal_mode" "RenewalMode" NOT NULL DEFAULT 'MANUAL_REVIEW',
    "renewal_coverage_start_month" INTEGER NOT NULL DEFAULT 1,
    "renewal_coverage_start_day" INTEGER NOT NULL DEFAULT 1,
    "renewal_coverage_end_month" INTEGER NOT NULL DEFAULT 12,
    "renewal_coverage_end_day" INTEGER NOT NULL DEFAULT 31,
    "renewal_grace_days" INTEGER NOT NULL DEFAULT 0,
    "renewal_reminder_lead_days" INTEGER NOT NULL DEFAULT 30,
    "renewal_reminder_frequency" "RenewalReminderFrequency" NOT NULL DEFAULT 'WEEKLY',
    "annual_renewal_fee" INTEGER NOT NULL DEFAULT 0,
    "include_renewal_fee_in_application" BOOLEAN NOT NULL DEFAULT false,
    "show_certificate_to_active_members" BOOLEAN NOT NULL DEFAULT true,
    "show_certificate_when_renewal_due" BOOLEAN NOT NULL DEFAULT false,
    "show_membership_card_to_active_members" BOOLEAN NOT NULL DEFAULT true,
    "show_membership_card_when_renewal_due" BOOLEAN NOT NULL DEFAULT false,
    "applicant_message" TEXT,
    "payment_collection_mode" "PaymentCollectionMode" NOT NULL DEFAULT 'MANUAL_PROOF',
    "application_fee" INTEGER NOT NULL DEFAULT 0,
    "is_tax_enabled" BOOLEAN NOT NULL DEFAULT false,
    "tax_percentage" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "manual_payment_instructions" TEXT,
    "mpesa_business_name" TEXT,
    "mpesa_paybill_number" TEXT,
    "mpesa_short_code" TEXT,
    "daraja_transaction_type" TEXT,
    "is_c2b_enabled" BOOLEAN NOT NULL DEFAULT false,
    "c2b_short_code" TEXT,
    "c2b_validation_url" TEXT,
    "c2b_confirmation_url" TEXT,
    "c2b_response_type" TEXT,
    "c2b_registered_at" TIMESTAMP(3),
    "c2b_last_registration_note" TEXT,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_portal_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_payment_proof_histories" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "paymentProofUrl" TEXT NOT NULL,
    "paymentProofOriginalName" TEXT NOT NULL,
    "archived_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_payment_proof_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_applications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "salutation" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "surname" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "ageBracket" TEXT NOT NULL,
    "countyCode" TEXT,
    "county" TEXT NOT NULL,
    "subCountyCode" TEXT,
    "subCounty" TEXT NOT NULL,
    "wardCode" TEXT,
    "ward" TEXT NOT NULL,
    "residenceAddress" TEXT,
    "nextOfKinFirstName" TEXT,
    "nextOfKinSurname" TEXT,
    "nextOfKinRelationship" TEXT,
    "nextOfKinPhone" TEXT,
    "idNumber" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "alternativePhoneNumber" TEXT,
    "profession" TEXT,
    "currentJobTitle" TEXT,
    "employerOrOrganizationName" TEXT,
    "workAddressOrLocation" TEXT,
    "yearsOfExperience" TEXT,
    "areasOfExpertise" TEXT[],
    "highestLevelOfEducation" TEXT,
    "institutionForHighestDegree" TEXT,
    "yearOfGraduationForHighestDegree" TEXT,
    "isLicensed" BOOLEAN NOT NULL,
    "regulatoryBody" TEXT,
    "yearOfRegistration" TEXT,
    "membershipType" "MembershipType" NOT NULL,
    "membership_number" TEXT,
    "membership_category_id" TEXT NOT NULL,
    "membershipCategory" TEXT NOT NULL,
    "preferredChapterOrRegion" TEXT,
    "refereeOneName" TEXT,
    "refereeOnePhone" TEXT,
    "refereeOneEmail" TEXT,
    "refereeOneRelationship" TEXT,
    "refereeTwoName" TEXT,
    "refereeTwoPhone" TEXT,
    "refereeTwoEmail" TEXT,
    "refereeTwoRelationship" TEXT,
    "payment_collection_mode" "PaymentCollectionMode" NOT NULL DEFAULT 'MANUAL_PROOF',
    "paymentMethod" "PaymentMethod" NOT NULL,
    "payer_phone_number" TEXT,
    "payment_base_amount" INTEGER,
    "payment_tax_amount" INTEGER,
    "payment_total_amount" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "transaction_reference_number" TEXT,
    "payment_proof_url" TEXT,
    "payment_proof_original_name" TEXT,
    "declarationConfirmed" BOOLEAN NOT NULL,
    "codeOfConductAccepted" BOOLEAN NOT NULL,
    "dataProcessingConsent" BOOLEAN NOT NULL,
    "digitalSignature" TEXT NOT NULL,
    "declarationDate" TIMESTAMP(3) NOT NULL,
    "areasOfInterest" TEXT[],
    "willingnessToVolunteer" BOOLEAN,
    "committeeInterest" TEXT,
    "referralSource" TEXT,
    "linkedInProfileUrl" TEXT,
    "rejectionReason" TEXT,
    "reviewNotes" TEXT,
    "flaggedSections" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "flaggedFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "resubmission_count" INTEGER NOT NULL DEFAULT 0,
    "rejected_at" TIMESTAMP(3),
    "resubmitted_at" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewed_by_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_payment_records" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "purpose" "PaymentPurpose" NOT NULL DEFAULT 'APPLICATION_FEE',
    "billing_year" INTEGER,
    "payment_intent_id" TEXT,
    "collection_mode" "PaymentCollectionMode" NOT NULL DEFAULT 'MANUAL_PROOF',
    "provider" "PaymentProvider" NOT NULL DEFAULT 'MANUAL',
    "paymentMethod" "PaymentMethod" NOT NULL,
    "transaction_reference_number" TEXT NOT NULL,
    "provider_reference" TEXT,
    "external_reference" TEXT,
    "checkout_request_id" TEXT,
    "merchant_request_id" TEXT,
    "payer_phone_number" TEXT,
    "amount" INTEGER,
    "base_amount" INTEGER,
    "tax_amount" INTEGER,
    "total_amount" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "verification_status" "PaymentVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verification_source" "PaymentVerificationSource",
    "raw_request_payload" JSONB,
    "raw_callback_payload" JSONB,
    "reconciliation_payload" JSONB,
    "description" TEXT,
    "notes" TEXT,
    "proof_url" TEXT,
    "proof_original_name" TEXT,
    "status" "MemberPaymentStatus" NOT NULL DEFAULT 'VERIFIED',
    "initiated_at" TIMESTAMP(3),
    "callback_received_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "recorded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_payment_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_incidents" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "application_id" TEXT,
    "payment_intent_id" TEXT,
    "mpesa_request_id" TEXT,
    "type" TEXT NOT NULL,
    "severity" "PaymentIncidentSeverity" NOT NULL DEFAULT 'WARNING',
    "status" "PaymentIncidentStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "metadata" JSONB,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "resolution_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mpesa_c2b_receipts" (
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

    CONSTRAINT "mpesa_c2b_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mpesa_stk_requests" (
    "id" TEXT NOT NULL,
    "payment_intent_id" TEXT,
    "application_id" TEXT,
    "user_id" TEXT,
    "phone_number" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "base_amount" INTEGER,
    "tax_amount" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "account_reference" TEXT NOT NULL,
    "transaction_desc" TEXT NOT NULL,
    "merchant_request_id" TEXT,
    "checkout_request_id" TEXT,
    "customer_message" TEXT,
    "callback_url" TEXT NOT NULL,
    "status" "MpesaStkStatus" NOT NULL DEFAULT 'INITIATED',
    "request_payload" JSONB,
    "response_payload" JSONB,
    "callback_payload" JSONB,
    "callback_received_at" TIMESTAMP(3),
    "status_query_payload" JSONB,
    "status_query_response" JSONB,
    "last_status_query_at" TIMESTAMP(3),
    "transaction_status_payload" JSONB,
    "transaction_status_response" JSONB,
    "transaction_status_callback_payload" JSONB,
    "transaction_status_timeout_payload" JSONB,
    "transaction_status_originator_conversation_id" TEXT,
    "transaction_status_conversation_id" TEXT,
    "last_transaction_status_query_at" TIMESTAMP(3),
    "reconciliation_attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_reconciled_at" TIMESTAMP(3),
    "next_reconciliation_at" TIMESTAMP(3),
    "last_reconciliation_source" "MpesaReconciliationSource",
    "last_reconciliation_note" TEXT,
    "result_code" INTEGER,
    "result_desc" TEXT,
    "mpesa_receipt_number" TEXT,
    "transaction_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mpesa_stk_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "two_factor_tokens" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "two_factor_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "two_factor_confirmations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "two_factor_confirmations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limiter_flexible" (
    "key" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "expire" TIMESTAMP(3),

    CONSTRAINT "rate_limiter_flexible_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "login_rate_limit_locks" (
    "account_key" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "locked_until" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "login_rate_limit_locks_pkey" PRIMARY KEY ("account_key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "payment_intents_application_id_key" ON "payment_intents"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_notification_states_user_id_key" ON "user_notification_states"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "application_drafts_user_id_key" ON "application_drafts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "applicant_profiles_user_id_key" ON "applicant_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "membership_categories_name_key" ON "membership_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "membership_categories_slug_key" ON "membership_categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "application_portal_settings_singleton_key_key" ON "application_portal_settings"("singleton_key");

-- CreateIndex
CREATE UNIQUE INDEX "membership_applications_user_id_key" ON "membership_applications"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "membership_applications_idNumber_key" ON "membership_applications"("idNumber");

-- CreateIndex
CREATE UNIQUE INDEX "membership_applications_email_key" ON "membership_applications"("email");

-- CreateIndex
CREATE UNIQUE INDEX "membership_applications_phoneNumber_key" ON "membership_applications"("phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "membership_applications_membership_number_key" ON "membership_applications"("membership_number");

-- CreateIndex
CREATE UNIQUE INDEX "mpesa_c2b_receipts_trans_id_key" ON "mpesa_c2b_receipts"("trans_id");

-- CreateIndex
CREATE UNIQUE INDEX "mpesa_stk_requests_merchant_request_id_key" ON "mpesa_stk_requests"("merchant_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "mpesa_stk_requests_checkout_request_id_key" ON "mpesa_stk_requests"("checkout_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key" ON "accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_email_token_key" ON "verification_tokens"("email", "token");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_key" ON "password_reset_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_email_token_key" ON "password_reset_tokens"("email", "token");

-- CreateIndex
CREATE UNIQUE INDEX "two_factor_tokens_token_key" ON "two_factor_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "two_factor_tokens_email_token_key" ON "two_factor_tokens"("email", "token");

-- CreateIndex
CREATE UNIQUE INDEX "two_factor_confirmations_userId_key" ON "two_factor_confirmations"("userId");

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "membership_applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_membership_application_id_fkey" FOREIGN KEY ("membership_application_id") REFERENCES "membership_applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_notification_states" ADD CONSTRAINT "user_notification_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_drafts" ADD CONSTRAINT "application_drafts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applicant_profiles" ADD CONSTRAINT "applicant_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_portal_settings" ADD CONSTRAINT "application_portal_settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_payment_proof_histories" ADD CONSTRAINT "application_payment_proof_histories_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "membership_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_applications" ADD CONSTRAINT "membership_applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_applications" ADD CONSTRAINT "membership_applications_membership_category_id_fkey" FOREIGN KEY ("membership_category_id") REFERENCES "membership_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_applications" ADD CONSTRAINT "membership_applications_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_payment_records" ADD CONSTRAINT "membership_payment_records_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "membership_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_payment_records" ADD CONSTRAINT "membership_payment_records_payment_intent_id_fkey" FOREIGN KEY ("payment_intent_id") REFERENCES "payment_intents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_payment_records" ADD CONSTRAINT "membership_payment_records_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_incidents" ADD CONSTRAINT "payment_incidents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_incidents" ADD CONSTRAINT "payment_incidents_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "membership_applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_incidents" ADD CONSTRAINT "payment_incidents_payment_intent_id_fkey" FOREIGN KEY ("payment_intent_id") REFERENCES "payment_intents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_incidents" ADD CONSTRAINT "payment_incidents_mpesa_request_id_fkey" FOREIGN KEY ("mpesa_request_id") REFERENCES "mpesa_stk_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mpesa_c2b_receipts" ADD CONSTRAINT "mpesa_c2b_receipts_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "membership_applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mpesa_c2b_receipts" ADD CONSTRAINT "mpesa_c2b_receipts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mpesa_stk_requests" ADD CONSTRAINT "mpesa_stk_requests_payment_intent_id_fkey" FOREIGN KEY ("payment_intent_id") REFERENCES "payment_intents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mpesa_stk_requests" ADD CONSTRAINT "mpesa_stk_requests_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "membership_applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mpesa_stk_requests" ADD CONSTRAINT "mpesa_stk_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "two_factor_confirmations" ADD CONSTRAINT "two_factor_confirmations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
