CREATE TABLE "record_games" (
	"match_id" text NOT NULL,
	"puuid" text NOT NULL,
	"champion_name" text NOT NULL,
	"position" text NOT NULL,
	"queue_id" integer NOT NULL,
	"game_start_at" timestamp with time zone NOT NULL,
	"win" boolean NOT NULL,
	"cs_at_10" smallint,
	"gold_at_15" integer,
	"level_6_s" smallint,
	"early_deaths" smallint,
	"early_takedowns" smallint,
	"version" smallint NOT NULL,
	CONSTRAINT "record_games_match_id_puuid_pk" PRIMARY KEY("match_id","puuid")
);
--> statement-breakpoint
ALTER TABLE "record_games" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "record_games" ADD CONSTRAINT "record_games_match_id_matches_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("match_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "record_games_puuid_idx" ON "record_games" USING btree ("puuid","game_start_at");