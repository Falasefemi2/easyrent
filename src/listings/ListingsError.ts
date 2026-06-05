import { Schema } from "effect";

export class ListingNotFound extends Schema.TaggedErrorClass<ListingNotFound>()(
	"ListingNotFound",
	{ message: Schema.String },
	{ httpApiStatus: 404 },
) {}

export class ListingForbidden extends Schema.TaggedErrorClass<ListingForbidden>()(
	"ListingForbidden",
	{ message: Schema.String },
	{ httpApiStatus: 403 },
) {}

export class ListingMediaError extends Schema.TaggedErrorClass<ListingMediaError>()(
	"ListingMediaError",
	{ message: Schema.String },
	{ httpApiStatus: 422 },
) {}
