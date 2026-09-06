CREATE TABLE "time_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"task_id" uuid,
	"description" text NOT NULL,
	"mode" varchar(16) NOT NULL,
	"work_date" date NOT NULL,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"duration_seconds" integer,
	"billable" boolean NOT NULL,
	"hourly_rate" numeric(18, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "time_entries_mode_valid" CHECK ("time_entries"."mode" IN ('timer', 'range', 'duration')),
	CONSTRAINT "time_entries_shape_valid" CHECK ((
        "time_entries"."mode" = 'timer'
        AND "time_entries"."start_at" IS NOT NULL
        AND (
          ("time_entries"."end_at" IS NULL AND "time_entries"."duration_seconds" IS NULL)
          OR ("time_entries"."end_at" IS NOT NULL AND "time_entries"."duration_seconds" > 0)
        )
      ) OR (
        "time_entries"."mode" = 'range'
        AND "time_entries"."start_at" IS NOT NULL
        AND "time_entries"."end_at" IS NOT NULL
        AND "time_entries"."duration_seconds" > 0
      ) OR (
        "time_entries"."mode" = 'duration'
        AND "time_entries"."start_at" IS NULL
        AND "time_entries"."end_at" IS NULL
        AND "time_entries"."duration_seconds" > 0
      )),
	CONSTRAINT "time_entries_billable_rate_valid" CHECK (("time_entries"."duration_seconds" IS NULL AND "time_entries"."hourly_rate" IS NULL)
        OR ("time_entries"."billable" AND "time_entries"."hourly_rate" IS NOT NULL AND "time_entries"."hourly_rate" >= 0)
        OR (NOT "time_entries"."billable" AND "time_entries"."hourly_rate" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "projects_id_client_user_unique" ON "projects" USING btree ("id","client_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_id_project_unique" ON "tasks" USING btree ("id","project_id");--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_client_owner_fk" FOREIGN KEY ("client_id","user_id") REFERENCES "public"."clients"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_project_hierarchy_fk" FOREIGN KEY ("project_id","client_id","user_id") REFERENCES "public"."projects"("id","client_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_task_project_fk" FOREIGN KEY ("task_id","project_id") REFERENCES "public"."tasks"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "time_entries_one_running_timer_per_user" ON "time_entries" USING btree ("user_id") WHERE "time_entries"."mode" = 'timer' AND "time_entries"."end_at" IS NULL;--> statement-breakpoint
CREATE INDEX "time_entries_user_work_date_idx" ON "time_entries" USING btree ("user_id","work_date");--> statement-breakpoint
CREATE INDEX "time_entries_user_client_work_date_idx" ON "time_entries" USING btree ("user_id","client_id","work_date");--> statement-breakpoint
CREATE INDEX "time_entries_user_project_work_date_idx" ON "time_entries" USING btree ("user_id","project_id","work_date");--> statement-breakpoint
CREATE INDEX "time_entries_user_task_work_date_idx" ON "time_entries" USING btree ("user_id","task_id","work_date");
