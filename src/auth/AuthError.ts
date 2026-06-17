import { Schema } from "effect";

export class InvalidCredentials extends Schema.TaggedErrorClass<InvalidCredentials>()(
	"InvalidCredentials",
	{ message: Schema.String },
	{ httpApiStatus: 401 },
) {}

export class EmailAlreadyTaken extends Schema.TaggedErrorClass<EmailAlreadyTaken>()(
	"EmailAlreadyTaken",
	{ message: Schema.String },
	{ httpApiStatus: 409 },
) {}

export class InvalidToken extends Schema.TaggedErrorClass<InvalidToken>()(
	"InvalidToken",
	{ message: Schema.String },
	{ httpApiStatus: 401 },
) {}

export class TokenExpired extends Schema.TaggedErrorClass<TokenExpired>()(
	"TokenExpired",
	{ message: Schema.String },
	{ httpApiStatus: 401 },
) {}

export class EmailNotVerified extends Schema.TaggedErrorClass<EmailNotVerified>()(
	"EmailNotVerified",
	{ message: Schema.String },
	{ httpApiStatus: 403 },
) {}

export class InvalidVerificationToken extends Schema.TaggedErrorClass<InvalidVerificationToken>()(
	"InvalidVerificationToken",
	{ message: Schema.String },
	{ httpApiStatus: 400 },
) {}

export class TokenExpiredError extends Schema.TaggedErrorClass<TokenExpiredError>()(
	"VerificationTokenExpired",
	{ message: Schema.String },
	{ httpApiStatus: 400 },
) {}
