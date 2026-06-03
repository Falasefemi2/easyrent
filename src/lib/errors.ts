import { Schema } from "effect";

export class ConfigError extends Schema.TaggedErrorClass<ConfigError>()(
	"ConfigError",
	{ message: Schema.String },
) {}
