CREATE TABLE "score_games" (
	"match_id" text PRIMARY KEY NOT NULL,
	"game" jsonb NOT NULL,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "score_games" ENABLE ROW LEVEL SECURITY;