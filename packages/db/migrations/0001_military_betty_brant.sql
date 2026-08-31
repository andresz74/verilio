CREATE TABLE "business_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"business_name" text NOT NULL,
	"email" text NOT NULL,
	"address" text NOT NULL,
	"phone" text,
	"tax_identifier" text,
	"default_currency" varchar(3) NOT NULL,
	"default_hourly_rate" numeric(18, 4) NOT NULL,
	"payment_terms_days" integer NOT NULL,
	"invoice_prefix" varchar(32) NOT NULL,
	"next_invoice_number" integer NOT NULL,
	"default_tax_rate" numeric(7, 4) NOT NULL,
	"default_invoice_notes" text,
	"invoice_footer" text,
	"timezone" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_profiles_hourly_rate_nonnegative" CHECK ("business_profiles"."default_hourly_rate" >= 0),
	CONSTRAINT "business_profiles_payment_terms_nonnegative" CHECK ("business_profiles"."payment_terms_days" >= 0),
	CONSTRAINT "business_profiles_next_invoice_number_positive" CHECK ("business_profiles"."next_invoice_number" > 0),
	CONSTRAINT "business_profiles_tax_rate_range" CHECK ("business_profiles"."default_tax_rate" >= 0 AND "business_profiles"."default_tax_rate" <= 100)
);
--> statement-breakpoint
ALTER TABLE "business_profiles" ADD CONSTRAINT "business_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;