CREATE TABLE "match_recaps" (
	"match_id" text NOT NULL,
	"puuid" text NOT NULL,
	"headline" text NOT NULL,
	"detail" text NOT NULL,
	"model" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_recaps_match_id_puuid_pk" PRIMARY KEY("match_id","puuid")
);
--> statement-breakpoint
ALTER TABLE "match_recaps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "match_recaps" ADD CONSTRAINT "match_recaps_match_id_matches_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("match_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_recaps" ADD CONSTRAINT "match_recaps_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_recaps_created_by_idx" ON "match_recaps" USING btree ("created_by","created_at");