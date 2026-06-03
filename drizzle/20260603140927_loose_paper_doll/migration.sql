CREATE TYPE "media_type" AS ENUM('image', 'video');--> statement-breakpoint
CREATE TYPE "status" AS ENUM('avaiable', 'rented', 'inative');--> statement-breakpoint
CREATE TABLE "favorites" (
	"user_id" uuid,
	"listing_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_pkey" PRIMARY KEY("user_id","listing_id")
);
--> statement-breakpoint
CREATE TABLE "listing_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"listing_id" uuid NOT NULL,
	"url" text NOT NULL,
	"type" "media_type" NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"landlord_id" uuid NOT NULL,
	"title" varchar NOT NULL,
	"description" varchar NOT NULL,
	"price" numeric(10,2) NOT NULL,
	"rooms" integer DEFAULT 0,
	"furnished" boolean DEFAULT false NOT NULL,
	"status" "status" DEFAULT 'avaiable'::"status",
	"location" geography(POINT,4326) NOT NULL,
	"address" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"email" varchar(255) NOT NULL UNIQUE,
	"phone" varchar NOT NULL UNIQUE,
	"password_hash" text NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"avatar_url" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "listings_status_idx" ON "listings" ("status");--> statement-breakpoint
CREATE INDEX "listings_price_idx" ON "listings" ("price");--> statement-breakpoint
CREATE INDEX "listings_landlord_idx" ON "listings" ("landlord_id");--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_listing_id_listings_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "listing_media" ADD CONSTRAINT "listing_media_listing_id_listings_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_landlord_id_users_id_fkey" FOREIGN KEY ("landlord_id") REFERENCES "users"("id") ON DELETE CASCADE;