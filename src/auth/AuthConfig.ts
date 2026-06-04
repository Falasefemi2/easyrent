import { Context, Effect, Layer } from "effect";
import { loadConfig } from "../lib/config";

export interface AuthConfigShape {
	readonly accessTokenSecret: Uint8Array;
	readonly refreshTokenSecret: Uint8Array;
	readonly accessTokenTtlSeconds: number;
	readonly refreshTokenTtlDays: number;
	readonly port: number;
	readonly databaseUrl: string;
}

export class AuthConfig extends Context.Service<AuthConfig, AuthConfigShape>()(
	"easyrent/auth/AuthConfig",
) {
	static readonly layer = Layer.effect(
		AuthConfig,
		Effect.gen(function* () {
			const config = yield* loadConfig;
			return {
				accessTokenSecret: base64ToUint8Array(
					config.ACCESS_TOKEN_SECRET,
				),
				refreshTokenSecret: base64ToUint8Array(
					config.REFRESH_TOKEN_SECRET,
				),
				accessTokenTtlSeconds: parseAccessTokenExpiry(
					config.ACCESS_TOKEN_EXPIRY,
				),
				refreshTokenTtlDays: parseRefreshTokenExpiry(
					config.REFRESH_TOKEN_EXPIRY,
				),
				port: parseInt(config.PORT),
				databaseUrl: config.DATABASE_URL,
			};
		}),
	);
}

function base64ToUint8Array(base64: string): Uint8Array {
	return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

function parseAccessTokenExpiry(expiry: string): number {
	const match = expiry.match(/^(\d+)(s|m|h)$/);
	if (!match)
		throw new Error(
			`Invalid ACCESS_TOKEN_EXPIRY: "${expiry}". Expected format: 15m, 1h, 30s`,
		);
	const value = parseInt(match[1]!);
	switch (match[2]) {
		case "s":
			return value;
		case "m":
			return value * 60;
		case "h":
			return value * 60 * 60;
		default:
			throw new Error("Unreachable");
	}
}

function parseRefreshTokenExpiry(expiry: string): number {
	const match = expiry.match(/^(\d+)(d|w)$/);
	if (!match)
		throw new Error(
			`Invalid REFRESH_TOKEN_EXPIRY: "${expiry}". Expected format: 7d, 2w`,
		);
	const value = parseInt(match[1]!);
	switch (match[2]) {
		case "d":
			return value;
		case "w":
			return value * 7;
		default:
			throw new Error("Unreachable");
	}
}
