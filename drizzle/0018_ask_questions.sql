CREATE TABLE "ask_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"puuid" text NOT NULL,
	"question" text NOT NULL,
	"answer" text,
	"games" jsonb NOT NULL,
	"model" text NOT NULL,
	"cost_micros" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ask_questions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ask_questions" ADD CONSTRAINT "ask_questions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ask_questions_user_idx" ON "ask_questions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ask_questions_created_at_idx" ON "ask_questions" USING btree ("created_at");