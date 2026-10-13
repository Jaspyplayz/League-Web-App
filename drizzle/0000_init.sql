CREATE TABLE "match_insights" (
	"match_id" text NOT NULL,
	"puuid" text NOT NULL,
	"opponent_puuid" text,
	"gold_diff_at_10" integer,
	"cs_diff_at_10" integer,
	"xp_diff_at_10" integer,
	"gold_diff_at_15" integer,
	"cs_diff_at_15" integer,
	"xp_diff_at_15" integer,
	"turning_points" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" smallint NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_insights_match_id_puuid_pk" PRIMARY KEY("match_id","puuid")
);
--> statement-breakpoint
ALTER TABLE "match_insights" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "match_participants" (
	"match_id" text NOT NULL,
	"puuid" text NOT NULL,
	"participant_id" smallint NOT NULL,
	"team_id" smallint NOT NULL,
	"champion_id" integer NOT NULL,
	"champion_name" text NOT NULL,
	"team_position" text NOT NULL,
	"win" boolean NOT NULL,
	"kills" smallint NOT NULL,
	"deaths" smallint NOT NULL,
	"assists" smallint NOT NULL,
	"cs" integer NOT NULL,
	"gold_earned" integer NOT NULL,
	"damage_to_champions" integer NOT NULL,
	"vision_score" integer NOT NULL,
	"items" integer[] NOT NULL,
	CONSTRAINT "match_participants_match_id_puuid_pk" PRIMARY KEY("match_id","puuid")
);
--> statement-breakpoint
ALTER TABLE "match_participants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "match_timelines" (
	"match_id" text PRIMARY KEY NOT NULL,
	"frames" jsonb NOT NULL,
	"events" jsonb NOT NULL,
	"trim_version" smallint NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "match_timelines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "matches" (
	"match_id" text PRIMARY KEY NOT NULL,
	"platform_id" text NOT NULL,
	"queue_id" integer NOT NULL,
	"game_version" text NOT NULL,
	"game_start_at" timestamp with time zone NOT NULL,
	"duration_s" integer NOT NULL,
	"raw" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "matches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "players" (
	"puuid" text PRIMARY KEY NOT NULL,
	"game_name" text NOT NULL,
	"tag_line" text NOT NULL,
	"region" text NOT NULL,
	"profile_icon_id" integer,
	"summoner_level" integer,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ranked_fetched_at" timestamp with time zone,
	"match_ids_fetched_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "players" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ranked_entries" (
	"puuid" text NOT NULL,
	"queue_type" text NOT NULL,
	"tier" text NOT NULL,
	"rank" text NOT NULL,
	"league_points" integer NOT NULL,
	"wins" integer NOT NULL,
	"losses" integer NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ranked_entries_puuid_queue_type_pk" PRIMARY KEY("puuid","queue_type")
);
--> statement-breakpoint
ALTER TABLE "ranked_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "match_insights" ADD CONSTRAINT "match_insights_match_id_matches_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("match_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_match_id_matches_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("match_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_timelines" ADD CONSTRAINT "match_timelines_match_id_matches_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("match_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranked_entries" ADD CONSTRAINT "ranked_entries_puuid_players_puuid_fk" FOREIGN KEY ("puuid") REFERENCES "public"."players"("puuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_insights_puuid_idx" ON "match_insights" USING btree ("puuid");--> statement-breakpoint
CREATE INDEX "match_participants_puuid_idx" ON "match_participants" USING btree ("puuid");--> statement-breakpoint
CREATE INDEX "matches_game_start_at_idx" ON "matches" USING btree ("game_start_at");--> statement-breakpoint
CREATE INDEX "players_riot_id_idx" ON "players" USING btree ("region",lower("game_name"),lower("tag_line"));