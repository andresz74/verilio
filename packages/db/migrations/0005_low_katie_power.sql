ALTER TABLE "time_entries" DROP CONSTRAINT "time_entries_billable_rate_valid";--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "currency" varchar(3);--> statement-breakpoint
-- One-time best-effort backfill: currency history predating this migration was not
-- stored independently, so completed billable entries inherit their currently
-- associated Client currency. New entries snapshot currency at finalization.
UPDATE "time_entries"
SET "currency" = "clients"."currency"
FROM "clients"
WHERE "time_entries"."client_id" = "clients"."id"
  AND "time_entries"."user_id" = "clients"."user_id"
  AND "time_entries"."duration_seconds" IS NOT NULL
  AND "time_entries"."billable";--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_billable_rate_valid" CHECK (("time_entries"."duration_seconds" IS NULL AND "time_entries"."hourly_rate" IS NULL AND "time_entries"."currency" IS NULL)
        OR ("time_entries"."billable" AND "time_entries"."hourly_rate" IS NOT NULL AND "time_entries"."hourly_rate" >= 0 AND "time_entries"."currency" IS NOT NULL)
        OR (NOT "time_entries"."billable" AND "time_entries"."hourly_rate" IS NULL AND "time_entries"."currency" IS NULL));
