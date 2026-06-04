// index.ts
import { HttpApiBuilder, HttpApiScalar } from "effect/unstable/httpapi";
import { Api } from "./src/auth/Api";
import { Effect, Layer } from "effect";
import { AuthApiHandlers } from "./src/auth/http";
import { HttpRouter } from "effect/unstable/http";
import { BunHttpServer, BunRuntime } from "@effect/platform-bun";
import { AuthorizationLayer } from "./src/auth/Authorization";
import { AuthConfig } from "./src/auth/AuthConfig";
import { DatabaseLive } from "./src/db";
import { UsersApiHandlers } from "./src/users/http";
import { UsersRepository } from "./src/users/UsersRepository";
import { TokenService } from "./src/auth/TokenService";
import { ImageUploadService } from "./src/services/UploadThingService";

// Base infrastructure layer — everything that other layers depend on
const InfraLive = Layer.mergeAll(DatabaseLive, AuthConfig.layer);

// Service layers that depend on infra
const ServicesLive = Layer.mergeAll(
	TokenService.layer,
	ImageUploadService.layer,
).pipe(Layer.provide(InfraLive));

// Repository layers that depend on DB
const RepositoriesLive = Layer.mergeAll(UsersRepository.layer).pipe(
	Layer.provide(InfraLive),
);

// Auth middleware layer
const AuthLive = AuthorizationLayer.pipe(Layer.provide(ServicesLive));

const ApiRoutes = HttpApiBuilder.layer(Api, {
	openapiPath: "/openapi.json",
}).pipe(Layer.provide([AuthApiHandlers, UsersApiHandlers]));

const DocsRoute = HttpApiScalar.layer(Api, { path: "/docs" });

const AllRoutes = Layer.mergeAll(ApiRoutes, DocsRoute);

const HttpServerLayer = HttpRouter.serve(AllRoutes).pipe(
	Layer.provide(BunHttpServer.layer({ port: 3000 })),
);

const AppLayer = HttpServerLayer.pipe(
	Layer.provide(AuthLive),
	Layer.provide(ServicesLive),
	Layer.provide(RepositoriesLive),
	Layer.provide(InfraLive),
);

BunRuntime.runMain(Layer.launch(AppLayer));
