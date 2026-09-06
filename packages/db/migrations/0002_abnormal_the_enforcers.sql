CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"cc_recipients" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"address" text,
	"note" text,
	"currency" varchar(3) NOT NULL,
	"default_hourly_rate" numeric(18, 4),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clients_default_hourly_rate_nonnegative" CHECK ("clients"."default_hourly_rate" IS NULL OR "clients"."default_hourly_rate" >= 0)
);
--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clients_user_active_idx" ON "clients" USING btree ("user_id","active");