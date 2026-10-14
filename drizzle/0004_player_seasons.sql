CREATE TABLE "player_seasons" (
	"puuid" text NOT NULL,
	"season" text NOT NULL,
	"match_ids" text[] NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_seasons_puuid_season_pk" PRIMARY KEY("puuid","season")
);
--> statement-breakpoint
ALTER TABLE "player_seasons" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "player_seasons" ADD CONSTRAINT "player_seasons_puuid_players_puuid_fk" FOREIGN KEY ("puuid") REFERENCES "public"."players"("puuid") ON DELETE cascade ON UPDATE no action;