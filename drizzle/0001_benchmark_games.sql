CREATE TABLE "benchmark_games" (
	"match_id" text NOT NULL,
	"puuid" text NOT NULL,
	"region" text NOT NULL,
	"game_start_at" timestamp with time zone NOT NULL,
	"champion_name" text NOT NULL,
	"position" text NOT NULL,
	"win" boolean NOT NULL,
	"gold_at_10" integer,
	"cs_at_10" integer,
	"gold_at_15" integer,
	"early_deaths" jsonb NOT NULL,
	"cs_per_min_early" real NOT NULL,
	"cs_per_min_mid" real,
	"cs_per_min_late" real,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "benchmark_games_match_id_puuid_pk" PRIMARY KEY("match_id","puuid")
);
--> statement-breakpoint
ALTER TABLE "benchmark_games" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "benchmark_games_position_idx" ON "benchmark_games" USING btree ("position","champion_name");--> statement-breakpoint
CREATE INDEX "benchmark_games_puuid_idx" ON "benchmark_games" USING btree ("puuid");