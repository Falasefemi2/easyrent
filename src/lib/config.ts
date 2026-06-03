import { Effect, Schema } from "effect";
import { ConfigError } from "../lib/errors.ts";

export class EnvConfig extends Schema.Class<EnvConfig>("EnvConfig")({
	DATABASE_URL: Schema.String,
	PORT: Schema.String,
	BETTER_AUTH_SECRET: Schema.String,
	BETTER_AUTH_URL: Schema.String,
}) {}

export const loadConfig = Schema.decodeUnknownExit(EnvConfig)(process.env).pipe(
	Effect.mapError(
		(error) =>
			new ConfigError({
				message: `invalid env variables: ${error.message}`,
			}),
	),
);
