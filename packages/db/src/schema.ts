import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
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
    uniqueIndex("projects_id_client_user_unique").on(
      table.id,
      table.clientId,
      table.userId,
    ),
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
  (table) => [
    uniqueIndex("tasks_id_project_unique").on(table.id, table.projectId),
    index("tasks_project_active_idx").on(table.projectId, table.active),
  ],
);

export const timeEntries = pgTable(
  "time_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull(),
    projectId: uuid("project_id").notNull(),
    taskId: uuid("task_id"),
    description: text("description").notNull(),
    mode: varchar("mode", { length: 16 }).notNull(),
    workDate: date("work_date", { mode: "string" }).notNull(),
    startAt: timestamp("start_at", { mode: "date", withTimezone: true }),
    endAt: timestamp("end_at", { mode: "date", withTimezone: true }),
    durationSeconds: integer("duration_seconds"),
    billable: boolean("billable").notNull(),
    hourlyRate: numeric("hourly_rate", { precision: 18, scale: 4 }),
    currency: varchar("currency", { length: 3 }),
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
      name: "time_entries_client_owner_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.projectId, table.clientId, table.userId],
      foreignColumns: [projects.id, projects.clientId, projects.userId],
      name: "time_entries_project_hierarchy_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.taskId, table.projectId],
      foreignColumns: [tasks.id, tasks.projectId],
      name: "time_entries_task_project_fk",
    }).onDelete("restrict"),
    uniqueIndex("time_entries_one_running_timer_per_user")
      .on(table.userId)
      .where(sql`${table.mode} = 'timer' AND ${table.endAt} IS NULL`),
    index("time_entries_user_work_date_idx").on(table.userId, table.workDate),
    index("time_entries_user_client_work_date_idx").on(
      table.userId,
      table.clientId,
      table.workDate,
    ),
    index("time_entries_user_project_work_date_idx").on(
      table.userId,
      table.projectId,
      table.workDate,
    ),
    index("time_entries_user_task_work_date_idx").on(
      table.userId,
      table.taskId,
      table.workDate,
    ),
    check("time_entries_mode_valid", sql`${table.mode} IN ('timer', 'range', 'duration')`),
    check(
      "time_entries_shape_valid",
      sql`(
        ${table.mode} = 'timer'
        AND ${table.startAt} IS NOT NULL
        AND (
          (${table.endAt} IS NULL AND ${table.durationSeconds} IS NULL)
          OR (${table.endAt} IS NOT NULL AND ${table.durationSeconds} > 0)
        )
      ) OR (
        ${table.mode} = 'range'
        AND ${table.startAt} IS NOT NULL
        AND ${table.endAt} IS NOT NULL
        AND ${table.durationSeconds} > 0
      ) OR (
        ${table.mode} = 'duration'
        AND ${table.startAt} IS NULL
        AND ${table.endAt} IS NULL
        AND ${table.durationSeconds} > 0
      )`,
    ),
    check(
      "time_entries_billable_rate_valid",
      sql`(${table.durationSeconds} IS NULL AND ${table.hourlyRate} IS NULL AND ${table.currency} IS NULL)
        OR (${table.billable} AND ${table.hourlyRate} IS NOT NULL AND ${table.hourlyRate} >= 0 AND ${table.currency} IS NOT NULL)
        OR (NOT ${table.billable} AND ${table.hourlyRate} IS NULL AND ${table.currency} IS NULL)`,
    ),
  ],
);

export type InvoiceSellerSnapshot = {
  businessName: string;
  email: string;
  address: string;
  phone: string | null;
  taxIdentifier: string | null;
};

export type InvoiceClientSnapshot = {
  name: string;
  email: string | null;
  ccRecipients: string[];
  address: string | null;
};

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    invoiceNumber: varchar("invoice_number", { length: 64 }).notNull(),
    clientId: uuid("client_id").notNull(),
    status: varchar("status", { length: 16 }).notNull().default("draft"),
    currency: varchar("currency", { length: 3 }).notNull(),
    issueDate: date("issue_date", { mode: "string" }).notNull(),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    paidAt: date("paid_at", { mode: "string" }),
    sellerSnapshot: jsonb("seller_snapshot").$type<InvoiceSellerSnapshot>().notNull(),
    clientSnapshot: jsonb("client_snapshot").$type<InvoiceClientSnapshot>().notNull(),
    subtotal: numeric("subtotal", { precision: 18, scale: 4 }).notNull().default("0"),
    discountType: varchar("discount_type", { length: 16 }).notNull().default("none"),
    discountValue: numeric("discount_value", { precision: 18, scale: 4 }).notNull().default("0"),
    discountAmount: numeric("discount_amount", { precision: 18, scale: 4 }).notNull().default("0"),
    taxPercent: numeric("tax_percent", { precision: 7, scale: 4 }).notNull().default("0"),
    taxAmount: numeric("tax_amount", { precision: 18, scale: 4 }).notNull().default("0"),
    total: numeric("total", { precision: 18, scale: 4 }).notNull().default("0"),
    notes: text("notes"),
    paymentTermsDays: integer("payment_terms_days").notNull().default(30),
    footer: text("footer"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("invoices_user_number_unique").on(table.userId, table.invoiceNumber),
    foreignKey({
      columns: [table.clientId, table.userId],
      foreignColumns: [clients.id, clients.userId],
      name: "invoices_client_owner_fk",
    }).onDelete("restrict"),
    index("invoices_user_status_idx").on(table.userId, table.status),
    index("invoices_user_client_issue_date_idx").on(
      table.userId,
      table.clientId,
      table.issueDate,
    ),
    check("invoices_status_valid", sql`${table.status} IN ('draft', 'sent', 'paid', 'void')`),
    check("invoices_discount_type_valid", sql`${table.discountType} IN ('none', 'percentage', 'fixed')`),
    check("invoices_dates_valid", sql`${table.dueDate} >= ${table.issueDate}`),
    check("invoices_amounts_nonnegative", sql`${table.subtotal} >= 0 AND ${table.discountValue} >= 0 AND ${table.discountAmount} >= 0 AND ${table.taxAmount} >= 0 AND ${table.total} >= 0`),
    check("invoices_discount_not_above_subtotal", sql`${table.discountAmount} <= ${table.subtotal}`),
    check("invoices_tax_percent_range", sql`${table.taxPercent} >= 0 AND ${table.taxPercent} <= 100`),
    check("invoices_percentage_discount_range", sql`${table.discountType} <> 'percentage' OR ${table.discountValue} <= 100`),
    check("invoices_payment_terms_nonnegative", sql`${table.paymentTermsDays} >= 0`),
    check("invoices_paid_date_valid", sql`(${table.status} = 'paid' AND ${table.paidAt} IS NOT NULL) OR (${table.status} <> 'paid' AND ${table.paidAt} IS NULL)`),
  ],
);

export const invoiceItems = pgTable(
  "invoice_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 16 }).notNull(),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 24, scale: 12 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 18, scale: 4 }).notNull(),
    amount: numeric("amount", { precision: 18, scale: 4 }).notNull(),
    sortOrder: integer("sort_order").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("invoice_items_invoice_sort_idx").on(table.invoiceId, table.sortOrder),
    check("invoice_items_kind_valid", sql`${table.kind} IN ('manual', 'time')`),
    check("invoice_items_quantity_positive", sql`${table.quantity} > 0`),
    check("invoice_items_unit_price_nonnegative", sql`${table.unitPrice} >= 0`),
    check("invoice_items_amount_nonnegative", sql`${table.amount} >= 0`),
  ],
);

export const invoiceItemTimeEntries = pgTable(
  "invoice_item_time_entries",
  {
    invoiceItemId: uuid("invoice_item_id")
      .notNull()
      .references(() => invoiceItems.id, { onDelete: "cascade" }),
    timeEntryId: uuid("time_entry_id")
      .notNull()
      .references(() => timeEntries.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.invoiceItemId, table.timeEntryId] }),
    index("invoice_item_time_entries_time_entry_idx").on(table.timeEntryId),
  ],
);
