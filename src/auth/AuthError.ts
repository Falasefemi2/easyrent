import { Schema } from "effect"

export class InvalidCredentials extends Schema.TaggedError<InvalidCredentials>()(
  "InvalidCredentials",
  { message: Schema.String },
  { httpApiStatus: 401 },
) {}

export class EmailAlreadyTaken extends Schema.TaggedError<EmailAlreadyTaken>()(
  "EmailAlreadyTaken",
  { message: Schema.String },
  { httpApiStatus: 409 },
) {}

export class InvalidToken extends Schema.TaggedError<InvalidToken>()(
  "InvalidToken",
  { message: Schema.String },
  { httpApiStatus: 401 },
) {}

export class TokenExpired extends Schema.TaggedError<TokenExpired>()(
  "TokenExpired",
  { message: Schema.String },
  { httpApiStatus: 401 },
) {}

export class EmailNotVerified extends Schema.TaggedError<EmailNotVerified>()(
  "EmailNotVerified",
  { message: Schema.String },
  { httpApiStatus: 403 },
) {}

export class InvalidVerificationToken extends Schema.TaggedError<InvalidVerificationToken>()(
  "InvalidVerificationToken",
  { message: Schema.String },
  { httpApiStatus: 400 },
) {}

export class TokenExpiredError extends Schema.TaggedError<TokenExpiredError>()(
  "VerificationTokenExpired",
  { message: Schema.String },
  { httpApiStatus: 400 },
) {}
