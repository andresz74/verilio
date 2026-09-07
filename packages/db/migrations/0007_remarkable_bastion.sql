ALTER TABLE "invoices" ADD COLUMN "payment_terms_days" integer;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "footer" text;--> statement-breakpoint
UPDATE "invoices"
SET
	"payment_terms_days" = "business_profiles"."payment_terms_days",
	"footer" = "business_profiles"."invoice_footer"
FROM "business_profiles"
WHERE "invoices"."user_id" = "business_profiles"."user_id";--> statement-breakpoint
UPDATE "invoices" SET "payment_terms_days" = 30 WHERE "payment_terms_days" IS NULL;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "payment_terms_days" SET DEFAULT 30;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "payment_terms_days" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_payment_terms_nonnegative" CHECK ("invoices"."payment_terms_days" >= 0);
