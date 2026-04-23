CREATE TABLE IF NOT EXISTS "home_chat_threads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "owner_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "title" text DEFAULT 'New chat' NOT NULL,
  "selected_model_id" text NOT NULL,
  "messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "home_chat_threads_company_owner_updated_idx" ON "home_chat_threads" USING btree ("company_id","owner_user_id","updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "home_chat_threads_company_updated_idx" ON "home_chat_threads" USING btree ("company_id","updated_at");
