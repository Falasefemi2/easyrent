// scripts/patch-drizzle.ts
import { readFileSync, writeFileSync } from "fs";

// Fix cache-effect.js
const cacheEffect = readFileSync(
	"node_modules/drizzle-orm/cache/core/cache-effect.js",
	"utf-8",
);
writeFileSync(
	"node_modules/drizzle-orm/cache/core/cache-effect.js",
	cacheEffect
		.replace("Effect.Service()", "Context.Service()")
		.replace(
			'import * as Effect from "effect/Effect";',
			'import * as Effect from "effect/Effect";\nimport * as Context from "effect/Context";',
		),
);

// Fix logger.js
const logger = readFileSync(
	"node_modules/drizzle-orm/effect-core/logger.js",
	"utf-8",
);
writeFileSync(
	"node_modules/drizzle-orm/effect-core/logger.js",
	logger
		.replace("Effect.Service()", "Context.Service()")
		.replace(
			'import * as Effect from "effect/Effect";',
			'import * as Effect from "effect/Effect";\nimport * as Context from "effect/Context";',
		),
);

// Fix errors.js
const errors = readFileSync(
	"node_modules/drizzle-orm/effect-core/errors.js",
	"utf-8",
);
writeFileSync(
	"node_modules/drizzle-orm/effect-core/errors.js",
	errors
		.replaceAll("Schema$1.TaggedError()", "Schema$1.TaggedErrorClass()")
		.replaceAll("this._tag", '"EffectDrizzleError"'),
);

console.log("Drizzle patches applied successfully");
