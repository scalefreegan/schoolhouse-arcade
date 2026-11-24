CREATE TABLE "answers" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"play_id" bigint NOT NULL,
	"player_id" uuid NOT NULL,
	"game_id" text NOT NULL,
	"fact" text NOT NULL,
	"given" integer,
	"correct" boolean NOT NULL,
	"ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "level_stars" (
	"player_id" uuid NOT NULL,
	"game_id" text NOT NULL,
	"level" text NOT NULL,
	"stars" smallint NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "level_stars_player_id_game_id_level_pk" PRIMARY KEY("player_id","game_id","level")
);
--> statement-breakpoint
CREATE TABLE "plays" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"player_id" uuid NOT NULL,
	"game_id" text NOT NULL,
	"level" text NOT NULL,
	"mode" text NOT NULL,
	"skill" text NOT NULL,
	"score" integer NOT NULL,
	"right_count" integer NOT NULL,
	"wrong_count" integer NOT NULL,
	"best_combo" integer NOT NULL,
	"time_ms" integer NOT NULL,
	"finished" boolean NOT NULL,
	"stars" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_play_id_plays_id_fk" FOREIGN KEY ("play_id") REFERENCES "public"."plays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_stars" ADD CONSTRAINT "level_stars_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plays" ADD CONSTRAINT "plays_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "answers_player_fact" ON "answers" USING btree ("player_id","game_id","fact","id");--> statement-breakpoint
CREATE INDEX "plays_board" ON "plays" USING btree ("game_id","level","mode","skill","score");--> statement-breakpoint
CREATE INDEX "plays_player" ON "plays" USING btree ("player_id","game_id","created_at");