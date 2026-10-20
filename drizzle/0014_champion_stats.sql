ALTER TABLE "match_participants" ADD COLUMN "individual_position" text;--> statement-breakpoint
ALTER TABLE "match_participants" ADD COLUMN "damage_taken" integer;--> statement-breakpoint
ALTER TABLE "match_participants" ADD COLUMN "objective_damage" integer;--> statement-breakpoint
ALTER TABLE "match_participants" ADD COLUMN "early_surrender" boolean;--> statement-breakpoint
ALTER TABLE "match_participants" ADD COLUMN "wards_placed" smallint;--> statement-breakpoint
ALTER TABLE "match_participants" ADD COLUMN "wards_killed" smallint;--> statement-breakpoint
ALTER TABLE "match_participants" ADD COLUMN "control_wards" smallint;--> statement-breakpoint
ALTER TABLE "match_participants" ADD COLUMN "double_kills" smallint;--> statement-breakpoint
ALTER TABLE "match_participants" ADD COLUMN "triple_kills" smallint;--> statement-breakpoint
ALTER TABLE "match_participants" ADD COLUMN "quadra_kills" smallint;--> statement-breakpoint
ALTER TABLE "match_participants" ADD COLUMN "penta_kills" smallint;--> statement-breakpoint
ALTER TABLE "match_participants" ADD COLUMN "cs_at_10" smallint;