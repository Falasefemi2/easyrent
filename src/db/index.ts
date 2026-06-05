import { PgClient } from "@effect/sql-pg";
import { Config, Context, type Effect, Layer } from "effect";
import * as DrizzleEffect from "drizzle-orm/effect-postgres";
import type { EffectPgDatabase } from "drizzle-orm/effect-postgres";

export type PgDatabase = EffectPgDatabase & { $client: PgClient.PgClient };

export const PgDatabase = Context.Service<PgDatabase>("auth/PgDatabase");

const PgClientLive = PgClient.layerConfig({
	url: Config.redacted("DATABASE_URL"),
});

const PgDatabaseLive = Layer.effect(
	PgDatabase,
	DrizzleEffect.makeWithDefaults() as Effect.Effect<
		PgDatabase,
		never,
		PgClient.PgClient
	>,
);

export const DatabaseLive = Layer.provideMerge(PgDatabaseLive, PgClientLive);
