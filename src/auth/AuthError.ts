import { Schema } from "effect";

export class InvalidCredentials extends Schema.TaggedErrorClass<InvalidCredentials>()(
	"InvalidCredentials",
	{
		message: Schema.String,
	},
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
