CREATE TABLE "season_games" (
	"puuid" text NOT NULL,
	"match_id" text NOT NULL,
	"game_start_at" timestamp with time zone NOT NULL,
	"queue_id" integer NOT NULL,
	"duration_s" integer NOT NULL,
	"champion_name" text NOT NULL,
	"win" boolean NOT NULL,
	"kills" smallint NOT NULL,
	"deaths" smallint NOT NULL,
	"assists" smallint NOT NULL,
	"cs" integer NOT NULL,
	CONSTRAINT "season_games_puuid_match_id_pk" PRIMARY KEY("puuid","match_id")
);
--> statement-breakpoint
ALTER TABLE "season_games" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "season_games" ADD CONSTRAINT "season_games_puuid_players_puuid_fk" FOREIGN KEY ("puuid") REFERENCES "public"."players"("puuid") ON DELETE cascade ON UPDATE no action;