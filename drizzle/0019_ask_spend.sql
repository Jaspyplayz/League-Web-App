CREATE TABLE "ask_spend" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cost_micros" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ask_spend" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "ask_spend_created_at_idx" ON "ask_spend" USING btree ("created_at");