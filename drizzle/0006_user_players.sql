CREATE TABLE "user_players" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"puuid" text NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_players" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_players" ADD CONSTRAINT "user_players_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_players" ADD CONSTRAINT "user_players_puuid_players_puuid_fk" FOREIGN KEY ("puuid") REFERENCES "public"."players"("puuid") ON DELETE cascade ON UPDATE no action;