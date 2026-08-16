ALTER TABLE "users" RENAME COLUMN "verification_token" TO "verificationToken";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "verification_token_expires_at" TO "verificationTokenExpiry";--> statement-breakpoint
CREATE INDEX "favorites_listing_idx" ON "favorites" ("listing_id");--> statement-breakpoint
CREATE INDEX "listing_media_listing_idx" ON "listing_media" ("listing_id");--> statement-breakpoint
CREATE INDEX "listings_created_at_idx" ON "listings" ("created_at");--> statement-breakpoint
CREATE INDEX "listings_location_idx" ON "listings" USING gist ("location");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_idx" ON "refresh_tokens" ("user_id");