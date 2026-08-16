import { Schema } from "effect"

export class ListingNotFound extends Schema.TaggedError<ListingNotFound>()(
  "ListingNotFound",
  { message: Schema.String },
  { httpApiStatus: 404 },
) {}

export class ListingForbidden extends Schema.TaggedError<ListingForbidden>()(
  "ListingForbidden",
  { message: Schema.String },
  { httpApiStatus: 403 },
) {}

export class ListingMediaError extends Schema.TaggedError<ListingMediaError>()(
  "ListingMediaError",
  { message: Schema.String },
  { httpApiStatus: 422 },
) {}
