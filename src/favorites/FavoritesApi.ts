import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
import { Schema } from "effect";
import { Authorization } from "../auth/Authorization";
import { AlreadyFavorited, FavoriteNotFound } from "./FavoritesError";

const MediaSchema = Schema.Struct({
	id: Schema.String,
	listingId: Schema.String,
	url: Schema.String,
	type: Schema.Literals(["image", "video"]),
	order: Schema.Number,
	createdAt: Schema.String,
});

const FavoriteListingSchema = Schema.Struct({
	id: Schema.String,
	landlordId: Schema.String,
	title: Schema.String,
	description: Schema.String,
	price: Schema.String,
	rooms: Schema.NullOr(Schema.Number),
	furnished: Schema.Boolean,
	status: Schema.NullOr(Schema.Literals(["avaiable", "rented", "inative"])),
	address: Schema.String,
	createdAt: Schema.String,
	updatedAt: Schema.String,
	media: Schema.Array(MediaSchema),
	favoriteCount: Schema.Number,
	favoritedAt: Schema.String,
});

const PaginatedFavoritesSchema = Schema.Struct({
	data: Schema.Array(FavoriteListingSchema),
	total: Schema.Number,
	page: Schema.Number,
	limit: Schema.Number,
	totalPages: Schema.Number,
});

const PaginationQuery = Schema.Struct({
	page: Schema.optional(Schema.NumberFromString),
	limit: Schema.optional(Schema.NumberFromString),
});

export class FavoritesApiGroup extends HttpApiGroup.make("favorites")
	.add(
		HttpApiEndpoint.post("add", "/favorites/:listingId", {
			params: Schema.Struct({ listingId: Schema.String }),
			success: Schema.Void,
			error: [AlreadyFavorited],
		}).middleware(Authorization),
	)
	.add(
		HttpApiEndpoint.delete("remove", "/favorites/:listingId", {
			params: Schema.Struct({ listingId: Schema.String }),
			success: Schema.Void,
			error: [FavoriteNotFound],
		}).middleware(Authorization),
	)
	.add(
		HttpApiEndpoint.get("myFavorites", "/favorites", {
			query: PaginationQuery,
			success: PaginatedFavoritesSchema,
		}).middleware(Authorization),
	)
	.add(
		HttpApiEndpoint.get("isFavorited", "/favorites/:listingId/check", {
			params: Schema.Struct({ listingId: Schema.String }),
			success: Schema.Struct({ favorited: Schema.Boolean }),
		}).middleware(Authorization),
	) {}
