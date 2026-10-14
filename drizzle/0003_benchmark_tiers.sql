DROP INDEX "benchmark_games_position_idx";--> statement-breakpoint
ALTER TABLE "benchmark_games" ADD COLUMN "tier" text DEFAULT 'CHALLENGER' NOT NULL;--> statement-breakpoint
CREATE INDEX "benchmark_games_tier_idx" ON "benchmark_games" USING btree ("tier");