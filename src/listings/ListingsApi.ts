import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
import { Authorization } from "../auth/Authorization";
import { RateLimitExceeded } from "../services/RateLimiter";
import { ImageUploadError } from "../services/UploadThingService";
import {
	ListingForbidden,
	ListingMediaError,
	ListingNotFound,
} from "./ListingsError";

const ListingSchema = Schema.Struct({
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
	favoriteCount: Schema.Number,
	latitude: Schema.NullOr(Schema.Number),
	longitude: Schema.NullOr(Schema.Number),
	coverImage: Schema.NullOr(Schema.String),
});

const ListingWithMediaSchema = Schema.Struct({
	...ListingSchema.fields,
	media: Schema.Array(
		Schema.Struct({
			id: Schema.String,
			listingId: Schema.String,
			url: Schema.String,
			type: Schema.Literals(["image", "video"]),
			order: Schema.Number,
			createdAt: Schema.String,
		}),
	),
	landlordPhone: Schema.NullOr(Schema.String),
	landlordName: Schema.NullOr(Schema.String),
});

const CreateListingPayload = Schema.Struct({
	title: Schema.String.pipe(Schema.check(Schema.isMinLength(3))),
	description: Schema.String.pipe(Schema.check(Schema.isMinLength(10))),
	price: Schema.String,
	rooms: Schema.Number,
	furnished: Schema.Boolean,
	latitude: Schema.Number,
	longitude: Schema.Number,
	address: Schema.String,
});

const PaginationSchema = Schema.Struct({
	page: Schema.optional(
		Schema.NumberFromString.pipe(
			Schema.check(Schema.isGreaterThanOrEqualTo(1)),
		),
	),
	limit: Schema.optional(
		Schema.NumberFromString.pipe(
			Schema.check(Schema.isGreaterThanOrEqualTo(1)),
			Schema.check(Schema.isLessThanOrEqualTo(100)),
		),
	),
});

const PaginatedListingSchema = Schema.Struct({
	data: Schema.Array(ListingSchema),
	total: Schema.Number,
	page: Schema.Number,
	limit: Schema.Number,
	totalPages: Schema.Number,
});

export class ListingsApiGroup extends HttpApiGroup.make("listings")
	.add(
		HttpApiEndpoint.get("list", "/listings", {
			query: Schema.Struct({
				...PaginationSchema.fields,
				status: Schema.optional(
					Schema.Literals(["avaiable", "rented", "inative"]),
				),
				furnished: Schema.optional(Schema.String), // "true" | "false"
				rooms: Schema.optional(Schema.NumberFromString),
				minRooms: Schema.optional(Schema.NumberFromString),
				search: Schema.optional(Schema.String),
			}),
			success: PaginatedListingSchema,
			error: [RateLimitExceeded],
		}),
	)
	.add(
		HttpApiEndpoint.get("getById", "/listings/:id", {
			success: ListingWithMediaSchema,
			error: [ListingNotFound, RateLimitExceeded],
			params: Schema.Struct({
				id: Schema.String,
			}),
		}),
	)
	.add(
		HttpApiEndpoint.post("create", "/listings", {
			payload: CreateListingPayload,
			success: ListingSchema,
			error: [RateLimitExceeded],
		}).middleware(Authorization),
	)
	.add(
		HttpApiEndpoint.post("uploadMedia", "/listings/:id/media", {
			params: Schema.Struct({ id: Schema.String }),
			success: Schema.Struct({
				id: Schema.String,
				url: Schema.String,
				type: Schema.Literals(["image", "video"]),
				order: Schema.Number,
			}),
			error: [
				ListingNotFound,
				ListingForbidden,
				ListingMediaError,
				ImageUploadError,
			],
		}).middleware(Authorization),
	)
	.add(
		HttpApiEndpoint.patch("update", "/listings/:id", {
			payload: Schema.Struct({
				title: Schema.optional(Schema.String),
				description: Schema.optional(Schema.String),
				price: Schema.optional(Schema.String),
				rooms: Schema.optional(Schema.Number),
				furnished: Schema.optional(Schema.Boolean),
				latitude: Schema.optional(Schema.Number),
				longitude: Schema.optional(Schema.Number),
				address: Schema.optional(Schema.String),
			}),
			success: ListingSchema,
			error: [ListingNotFound, ListingForbidden],
			params: Schema.Struct({ id: Schema.String }),
		}).middleware(Authorization),
	)
	.add(
		HttpApiEndpoint.delete("delete", "/listings/:id", {
			params: Schema.Struct({ id: Schema.String }),
			success: Schema.Void,
			error: [ListingNotFound, ListingForbidden],
		}).middleware(Authorization),
	)
	.add(
		HttpApiEndpoint.get("myListings", "/listings/my", {
			query: PaginationSchema,
			success: PaginatedListingSchema,
		}).middleware(Authorization),
	)
	.add(
		HttpApiEndpoint.patch("updateStatus", "/listings/:id/status", {
			params: Schema.Struct({ id: Schema.String }),
			payload: Schema.Struct({
				status: Schema.Literals(["avaiable", "rented", "inative"]),
			}),
			success: ListingSchema,
			error: [ListingNotFound, ListingForbidden],
		}).middleware(Authorization),
	) {}
