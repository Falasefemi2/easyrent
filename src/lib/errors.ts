import { Schema } from "effect"

export class ConfigError extends Schema.TaggedError<ConfigError>()("ConfigError", { message: Schema.String }) {}
