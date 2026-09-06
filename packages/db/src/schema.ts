import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
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

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    ccRecipients: text("cc_recipients")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    address: text("address"),
    note: text("note"),
    currency: varchar("currency", { length: 3 }).notNull(),
    defaultHourlyRate: numeric("default_hourly_rate", {
      precision: 18,
      scale: 4,
    }),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("clients_id_user_unique").on(table.id, table.userId),
    index("clients_user_active_idx").on(table.userId, table.active),
    check(
      "clients_default_hourly_rate_nonnegative",
      sql`${table.defaultHourlyRate} IS NULL OR ${table.defaultHourlyRate} >= 0`,
    ),
  ],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull(),
    name: text("name").notNull(),
    color: varchar("color", { length: 7 }),
    defaultHourlyRate: numeric("default_hourly_rate", {
      precision: 18,
      scale: 4,
    }),
    billableByDefault: boolean("billable_by_default").notNull().default(true),
    note: text("note"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientId, table.userId],
      foreignColumns: [clients.id, clients.userId],
      name: "projects_client_owner_fk",
    }).onDelete("restrict"),
    index("projects_user_client_active_idx").on(
      table.userId,
      table.clientId,
      table.active,
    ),
    check(
      "projects_default_hourly_rate_nonnegative",
      sql`${table.defaultHourlyRate} IS NULL OR ${table.defaultHourlyRate} >= 0`,
    ),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("tasks_project_active_idx").on(table.projectId, table.active)],
);
