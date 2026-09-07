CREATE TABLE "invoice_item_time_entries" (
	"invoice_item_id" uuid NOT NULL,
	"time_entry_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_item_time_entries_invoice_item_id_time_entry_id_pk" PRIMARY KEY("invoice_item_id","time_entry_id")
);
--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"kind" varchar(16) NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(24, 12) NOT NULL,
	"unit_price" numeric(18, 4) NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_items_kind_valid" CHECK ("invoice_items"."kind" IN ('manual', 'time')),
	CONSTRAINT "invoice_items_quantity_positive" CHECK ("invoice_items"."quantity" > 0),
	CONSTRAINT "invoice_items_unit_price_nonnegative" CHECK ("invoice_items"."unit_price" >= 0),
	CONSTRAINT "invoice_items_amount_nonnegative" CHECK ("invoice_items"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"invoice_number" varchar(64) NOT NULL,
	"client_id" uuid NOT NULL,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"currency" varchar(3) NOT NULL,
	"issue_date" date NOT NULL,
	"due_date" date NOT NULL,
	"paid_at" date,
	"seller_snapshot" jsonb NOT NULL,
	"client_snapshot" jsonb NOT NULL,
	"subtotal" numeric(18, 4) DEFAULT '0' NOT NULL,
	"discount_type" varchar(16) DEFAULT 'none' NOT NULL,
	"discount_value" numeric(18, 4) DEFAULT '0' NOT NULL,
	"discount_amount" numeric(18, 4) DEFAULT '0' NOT NULL,
	"tax_percent" numeric(7, 4) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(18, 4) DEFAULT '0' NOT NULL,
	"total" numeric(18, 4) DEFAULT '0' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_status_valid" CHECK ("invoices"."status" IN ('draft', 'sent', 'paid', 'void')),
	CONSTRAINT "invoices_discount_type_valid" CHECK ("invoices"."discount_type" IN ('none', 'percentage', 'fixed')),
	CONSTRAINT "invoices_dates_valid" CHECK ("invoices"."due_date" >= "invoices"."issue_date"),
	CONSTRAINT "invoices_amounts_nonnegative" CHECK ("invoices"."subtotal" >= 0 AND "invoices"."discount_value" >= 0 AND "invoices"."discount_amount" >= 0 AND "invoices"."tax_amount" >= 0 AND "invoices"."total" >= 0),
	CONSTRAINT "invoices_discount_not_above_subtotal" CHECK ("invoices"."discount_amount" <= "invoices"."subtotal"),
	CONSTRAINT "invoices_tax_percent_range" CHECK ("invoices"."tax_percent" >= 0 AND "invoices"."tax_percent" <= 100),
	CONSTRAINT "invoices_percentage_discount_range" CHECK ("invoices"."discount_type" <> 'percentage' OR "invoices"."discount_value" <= 100),
	CONSTRAINT "invoices_paid_date_valid" CHECK (("invoices"."status" = 'paid' AND "invoices"."paid_at" IS NOT NULL) OR ("invoices"."status" <> 'paid' AND "invoices"."paid_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "invoice_item_time_entries" ADD CONSTRAINT "invoice_item_time_entries_invoice_item_id_invoice_items_id_fk" FOREIGN KEY ("invoice_item_id") REFERENCES "public"."invoice_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_item_time_entries" ADD CONSTRAINT "invoice_item_time_entries_time_entry_id_time_entries_id_fk" FOREIGN KEY ("time_entry_id") REFERENCES "public"."time_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_owner_fk" FOREIGN KEY ("client_id","user_id") REFERENCES "public"."clients"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_item_time_entries_time_entry_idx" ON "invoice_item_time_entries" USING btree ("time_entry_id");--> statement-breakpoint
CREATE INDEX "invoice_items_invoice_sort_idx" ON "invoice_items" USING btree ("invoice_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_user_number_unique" ON "invoices" USING btree ("user_id","invoice_number");--> statement-breakpoint
CREATE INDEX "invoices_user_status_idx" ON "invoices" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "invoices_user_client_issue_date_idx" ON "invoices" USING btree ("user_id","client_id","issue_date");