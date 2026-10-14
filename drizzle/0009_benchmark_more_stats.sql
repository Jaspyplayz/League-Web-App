ALTER TABLE "benchmark_games" ADD COLUMN "xp_at_15" integer;--> statement-breakpoint
ALTER TABLE "benchmark_games" ADD COLUMN "early_takedowns" integer;--> statement-breakpoint
ALTER TABLE "benchmark_games" ADD COLUMN "vision_per_min" real;--> statement-breakpoint
ALTER TABLE "benchmark_games" ADD COLUMN "stronger_side" real;--> statement-breakpoint
ALTER TABLE "benchmark_games" ADD COLUMN "enemy_half" real;--> statement-breakpoint
ALTER TABLE "benchmark_games" ADD COLUMN "gank_takedowns" integer;--> statement-breakpoint
ALTER TABLE "benchmark_games" ADD COLUMN "objective_share" real;--> statement-breakpoint
ALTER TABLE "benchmark_games" ADD COLUMN "enemy_jungle_kills" integer;--> statement-breakpoint
ALTER TABLE "benchmark_games" ADD COLUMN "scuttles" integer;--> statement-breakpoint
ALTER TABLE "benchmark_games" ADD COLUMN "stats_version" integer DEFAULT 1 NOT NULL;