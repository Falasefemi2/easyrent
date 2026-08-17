import { PgClient } from "@effect/sql-pg"
import type { EffectPgDatabase } from "drizzle-orm/effect-postgres"
import * as DrizzleEffect from "drizzle-orm/effect-postgres"
import { Config, Context, Layer } from "effect"

export type PgDatabase = EffectPgDatabase & { $client: PgClient.PgClient }

export const PgDatabase = Context.Service<PgDatabase>("auth/PgDatabase")

const PgClientLive = PgClient.layerConfig({
  url: Config.redacted("DATABASE_URL"),
  ssl: Config.boolean("DATABASE_SSL").pipe(Config.withDefault(true)),
})

const PgDatabaseLive = Layer.effect(PgDatabase, DrizzleEffect.makeWithDefaults())

export const DatabaseLive = Layer.provideMerge(PgDatabaseLive, PgClientLive)
