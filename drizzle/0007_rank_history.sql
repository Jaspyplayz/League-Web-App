CREATE TABLE "rank_history" (
	"puuid" text NOT NULL,
	"queue_type" text NOT NULL,
	"tier" text NOT NULL,
	"rank" text NOT NULL,
	"league_points" integer NOT NULL,
	"wins" integer NOT NULL,
	"losses" integer NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rank_history_puuid_queue_type_recorded_at_pk" PRIMARY KEY("puuid","queue_type","recorded_at")
);
--> statement-breakpoint
ALTER TABLE "rank_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rank_history" ADD CONSTRAINT "rank_history_puuid_players_puuid_fk" FOREIGN KEY ("puuid") REFERENCES "public"."players"("puuid") ON DELETE cascade ON UPDATE no action;