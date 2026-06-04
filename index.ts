import { HttpApiBuilder, HttpApiScalar } from "effect/unstable/httpapi";
import { Api } from "./src/auth/Api";
import { Effect, Layer } from "effect";
import { AuthApiHandlers } from "./src/auth/http";
import { HttpRouter } from "effect/unstable/http";
import { BunHttpServer, BunRuntime } from "@effect/platform-bun";
import { AuthorizationLayer } from "./src/auth/Authorization";
import { AuthConfig } from "./src/auth/AuthConfig";
import { DatabaseLive } from "./src/db";

const ApiRoutes = HttpApiBuilder.layer(Api, {
	openapiPath: "/openapi.json",
}).pipe(Layer.provide(AuthApiHandlers));

const DocsRoute = HttpApiScalar.layer(Api, { path: "/docs" });

const AllRoutes = Layer.mergeAll(ApiRoutes, DocsRoute);

const HttpServerLayer = HttpRouter.serve(AllRoutes).pipe(
	Layer.provide(BunHttpServer.layer({ port: 3000 })),
);

const AppLayer = HttpServerLayer.pipe(
	Layer.provide(AuthorizationLayer),
	Layer.provide(DatabaseLive),
	Layer.provide(AuthConfig.layer),
);

BunRuntime.runMain(Layer.launch(AppLayer));
