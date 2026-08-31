import { sql } from "drizzle-orm";
import {
  check,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const businessProfiles = pgTable(
  "business_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    businessName: text("business_name").notNull(),
    email: text("email").notNull(),
    address: text("address").notNull(),
    phone: text("phone"),
    taxIdentifier: text("tax_identifier"),
    defaultCurrency: varchar("default_currency", { length: 3 }).notNull(),
    defaultHourlyRate: numeric("default_hourly_rate", {
      precision: 18,
      scale: 4,
    }).notNull(),
    paymentTermsDays: integer("payment_terms_days").notNull(),
    invoicePrefix: varchar("invoice_prefix", { length: 32 }).notNull(),
    nextInvoiceNumber: integer("next_invoice_number").notNull(),
    defaultTaxRate: numeric("default_tax_rate", {
      precision: 7,
      scale: 4,
    }).notNull(),
    defaultInvoiceNotes: text("default_invoice_notes"),
    invoiceFooter: text("invoice_footer"),
    timezone: text("timezone").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("business_profiles_hourly_rate_nonnegative", sql`${table.defaultHourlyRate} >= 0`),
    check(
      "business_profiles_payment_terms_nonnegative",
      sql`${table.paymentTermsDays} >= 0`,
    ),
    check(
      "business_profiles_next_invoice_number_positive",
      sql`${table.nextInvoiceNumber} > 0`,
    ),
    check(
      "business_profiles_tax_rate_range",
      sql`${table.defaultTaxRate} >= 0 AND ${table.defaultTaxRate} <= 100`,
    ),
  ],
);
