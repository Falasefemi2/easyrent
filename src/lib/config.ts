import { Effect, Schema } from "effect";
import { ConfigError } from "../lib/errors.ts";

export class EnvConfig extends Schema.Class<EnvConfig>("EnvConfig")({
	DATABASE_URL: Schema.String,
	ACCESS_TOKEN_SECRET: Schema.String,
	ACCESS_TOKEN_EXPIRY: Schema.String,
	REFRESH_TOKEN_SECRET: Schema.String,
	REFRESH_TOKEN_EXPIRY: Schema.String,
	PORT: Schema.String,
	UPLOADTHING_TOKEN: Schema.String,
	CLOUDINARY_CLOUD_NAME: Schema.String,
	CLOUDINARY_API_KEY: Schema.String,
	CLOUDINARY_API_SECRET: Schema.String,
}) {}

export const loadConfig = Schema.decodeUnknownExit(EnvConfig)(process.env).pipe(
	Effect.mapError(
		(error) =>
			new ConfigError({
				message: `invalid env variables: ${error.message}`,
			}),
	),
);
