CREATE TABLE "app_keys" (
	"kid" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"secret_ciphertext" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"not_after" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "apps" (
	"id" text PRIMARY KEY NOT NULL,
	"product" text NOT NULL,
	"name" text NOT NULL,
	"environment" text NOT NULL,
	"base_url" text NOT NULL,
	"version" text,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "apps_product_unique" UNIQUE("product"),
	CONSTRAINT "apps_base_url_unique" UNIQUE("base_url")
);
--> statement-breakpoint
CREATE TABLE "probes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text NOT NULL,
	"latency_ms" integer,
	"version" text,
	"outbox_pending" integer,
	"dependencies" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_keys" ADD CONSTRAINT "app_keys_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "probes" ADD CONSTRAINT "probes_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_keys_app_idx" ON "app_keys" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "probes_app_checked_idx" ON "probes" USING btree ("app_id","checked_at");--> statement-breakpoint
-- Events received from the apps, each stored once (the @kete/sdk receiver's table,
-- receivedEventsMigrationSql), and read by day and by product.
CREATE TABLE kete_received_events (
  event_id text PRIMARY KEY,
  product text NOT NULL,
  envelope jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX kete_received_events_product_received_idx ON kete_received_events (product, received_at);
