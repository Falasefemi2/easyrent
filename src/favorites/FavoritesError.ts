import { Schema } from "effect";

export class AlreadyFavorited extends Schema.TaggedErrorClass<AlreadyFavorited>()(
	"AlreadyFavorited",
	{
		message: Schema.String,
	},
	{ httpApiStatus: 409 },
) {}

export class FavoriteNotFound extends Schema.TaggedErrorClass<FavoriteNotFound>()(
	"FavoriteNotFound",
	{ message: Schema.String },
	{ httpApiStatus: 404 },
) {}
