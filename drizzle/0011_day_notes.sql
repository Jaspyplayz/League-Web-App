CREATE TABLE "day_notes" (
	"user_id" uuid NOT NULL,
	"day" text NOT NULL,
	"text" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "day_notes_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
ALTER TABLE "day_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "day_notes" ADD CONSTRAINT "day_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;