CREATE TABLE "riot_rate_limits" (
	"host" text PRIMARY KEY NOT NULL,
	"windows" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cooldown_until" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "riot_rate_limits" ENABLE ROW LEVEL SECURITY;