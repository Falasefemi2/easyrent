import { defineRelations } from "drizzle-orm";
import {
	boolean,
	customType,
	index,
	integer,
	numeric,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";

export const statusEnum = pgEnum("status", ["avaiable", "rented", "inative"]);
export const mediaTypeEnum = pgEnum("media_type", ["image", "video"]);

const geographyPoint = customType<{
	data: string;
}>({
	dataType() {
		return "geography(POINT,4326)";
	},
});

export const users = pgTable("users", {
	id: uuid("id").defaultRandom().primaryKey(),
	email: varchar("email", { length: 255 }).notNull().unique(),
	phone: varchar("phone").notNull().unique(),
	passwordHash: text("password_hash").notNull(),
	fullname: varchar("full_name", { length: 255 }).notNull(),
	avatarUrl: varchar("avatar_url"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
	emailVerified: boolean("emailVerified").default(false).notNull(),
	verificationToken: text("verificationToken"),
	verificationTokenExpiresAt: timestamp("verificationTokenExpiry"),
});

export const listings = pgTable(
	"listings",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		landlordId: uuid("landlord_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		title: varchar("title").notNull(),
		description: varchar("description").notNull(),
		price: numeric("price", { precision: 10, scale: 2 }).notNull(),
		rooms: integer("rooms").default(0),
		furnished: boolean("furnished").default(false).notNull(),
		status: statusEnum().default("avaiable"),
		location: geographyPoint("location").notNull(),
		address: varchar("address", { length: 255 }).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [
		index("listings_status_idx").on(table.status),
		index("listings_price_idx").on(table.price),
		index("listings_landlord_idx").on(table.landlordId),
	],
);

export const listingMedia = pgTable("listing_media", {
	id: uuid("id").defaultRandom().primaryKey(),
	listingId: uuid("listing_id")
		.notNull()
		.references(() => listings.id, {
			onDelete: "cascade",
		}),
	url: text("url").notNull(),
	type: mediaTypeEnum("type").notNull(),
	order: integer("order").default(0).notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const favorites = pgTable(
	"favorites",
	{
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, {
				onDelete: "cascade",
			}),
		listingId: uuid("listing_id")
			.notNull()
			.references(() => listings.id, {
				onDelete: "cascade",
			}),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		primaryKey({
			columns: [table.userId, table.listingId],
		}),
	],
);

export const refreshTokens = pgTable("refresh_tokens", {
	id: uuid("id").defaultRandom().primaryKey(),
	userId: uuid("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	tokenHash: text("token_hash").notNull().unique(), // store hash, not raw token
	expiresAt: timestamp("expires_at").notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	revokedAt: timestamp("revoked_at"), // null = active
});

export const relations = defineRelations(
	{
		users,
		listings,
		listingMedia,
		favorites,
	},
	(r) => ({
		users: {
			listings: r.many.listings(),
			favorites: r.many.favorites(),
		},

		listings: {
			landlord: r.one.users({
				from: r.listings.landlordId,
				to: r.users.id,
			}),

			media: r.many.listingMedia(),

			favorites: r.many.favorites(),
		},

		listingMedia: {
			listing: r.one.listings({
				from: r.listingMedia.listingId,
				to: r.listings.id,
			}),
		},

		favorites: {
			user: r.one.users({
				from: r.favorites.userId,
				to: r.users.id,
			}),

			listing: r.one.listings({
				from: r.favorites.listingId,
				to: r.listings.id,
			}),
		},
	}),
);
