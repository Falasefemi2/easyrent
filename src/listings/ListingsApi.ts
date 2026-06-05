import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
import {
	ListingForbidden,
	ListingMediaError,
	ListingNotFound,
} from "./ListingsError";
import { Authorization } from "../auth/Authorization";
import { ImageUploadError } from "../services/UploadThingService";

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
	createdAt: Schema.Date,
	updatedAt: Schema.Date,
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
			createdAt: Schema.Date,
		}),
	),
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

export class ListingsApiGroup extends HttpApiGroup.make("listings")
	.add(
		HttpApiEndpoint.get("list", "/listings", {
			success: Schema.Array(ListingSchema),
		}),
	)
	.add(
		HttpApiEndpoint.get("getById", "/listings/:id", {
			success: ListingWithMediaSchema,
			error: [ListingNotFound],
			params: Schema.Struct({
				id: Schema.String,
			}),
		}),
	)
	.add(
		HttpApiEndpoint.post("create", "/listings", {
			payload: CreateListingPayload,
			success: ListingSchema,
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
			success: Schema.Array(ListingSchema),
		}).middleware(Authorization),
	) {}
