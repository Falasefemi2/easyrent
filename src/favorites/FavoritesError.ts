import { Schema } from "effect"

export class AlreadyFavorited extends Schema.TaggedError<AlreadyFavorited>()(
  "AlreadyFavorited",
  {
    message: Schema.String,
  },
  { httpApiStatus: 409 },
) {}

export class FavoriteNotFound extends Schema.TaggedError<FavoriteNotFound>()(
  "FavoriteNotFound",
  { message: Schema.String },
  { httpApiStatus: 404 },
) {}
