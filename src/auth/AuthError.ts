import { Schema } from "effect";

export class InvalidCredentials extends Schema.TaggedErrorClass<InvalidCredentials>()(
	"InvalidCredentials",
	{ message: Schema.String },
) {}

export class EmailAlreadyTaken extends Schema.TaggedErrorClass<EmailAlreadyTaken>()(
	"EmailAlreadyTaken",
	{ message: Schema.String },
) {}

export class InvalidToken extends Schema.TaggedErrorClass<InvalidToken>()(
	"InvalidToken",
	{ message: Schema.String },
) {}

export class TokenExpired extends Schema.TaggedErrorClass<TokenExpired>()(
	"TokenExpired",
	{ message: Schema.String },
) {}
