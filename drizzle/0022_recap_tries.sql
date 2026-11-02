CREATE TABLE "recap_tries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recap_tries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recap_tries" ADD CONSTRAINT "recap_tries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recap_tries_user_idx" ON "recap_tries" USING btree ("user_id","created_at");