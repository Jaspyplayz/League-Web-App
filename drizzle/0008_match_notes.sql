CREATE TABLE "match_notes" (
	"user_id" uuid NOT NULL,
	"match_id" text NOT NULL,
	"text" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_notes_user_id_match_id_pk" PRIMARY KEY("user_id","match_id")
);
--> statement-breakpoint
ALTER TABLE "match_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "match_notes" ADD CONSTRAINT "match_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_notes" ADD CONSTRAINT "match_notes_match_id_matches_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("match_id") ON DELETE cascade ON UPDATE no action;