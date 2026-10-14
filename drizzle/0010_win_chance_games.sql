CREATE TABLE "win_chance_games" (
	"match_id" text PRIMARY KEY NOT NULL,
	"patch" text NOT NULL,
	"game_start_at" timestamp with time zone NOT NULL,
	"game" jsonb NOT NULL,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "win_chance_games" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "win_chance_games_start_idx" ON "win_chance_games" USING btree ("game_start_at");