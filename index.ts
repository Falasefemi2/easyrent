import { BunHttpServer, BunRuntime } from "@effect/platform-bun";
import { Layer } from "effect";
import { HttpMiddleware, HttpRouter } from "effect/unstable/http";
import { HttpApiBuilder, HttpApiScalar } from "effect/unstable/httpapi";
import { Api } from "./src/auth/Api";
import { AuthConfig } from "./src/auth/AuthConfig";
import { AuthorizationLayer } from "./src/auth/Authorization";
import { AuthApiHandlers } from "./src/auth/http";
import { TokenService } from "./src/auth/TokenService";
import { DatabaseLive } from "./src/db";
import { FavoritesApiHandlers } from "./src/favorites/http.ts";
import { ListingsApiHandlers } from "./src/listings/http";
import { RequestLoggerMiddleware } from "./src/middleware/RequestLoggerMiddleware";
import { CacheService } from "./src/services/CacheService.ts";
import { EmailService } from "./src/services/EmailService.ts";
import { LoggerService } from "./src/services/LoggerService.ts";
import { RedisService } from "./src/services/RedisService.ts";
import { ImageUploadService } from "./src/services/UploadThingService";
import { UsersApiHandlers } from "./src/users/http";
import { UsersRepository } from "./src/users/UsersRepository";

// Base infrastructure layer — everything that other layers depend on
const InfraLive = Layer.mergeAll(DatabaseLive, AuthConfig.layer);

const RedisLive = RedisService.layer.pipe(Layer.provide(InfraLive));

const CacheLive = CacheService.layer.pipe(Layer.provide(RedisLive));

const EmailLive = EmailService.layer.pipe(Layer.provide(InfraLive));

// Service layers that depend on infra
const ServicesLive = Layer.mergeAll(
	TokenService.layer,
	ImageUploadService.layer,
	EmailLive,
).pipe(Layer.provide(InfraLive));

// Repository layers that depend on DB
const RepositoriesLive = Layer.mergeAll(UsersRepository.layer).pipe(
	Layer.provide(InfraLive),
);

// Auth middleware layer
const AuthLive = AuthorizationLayer.pipe(Layer.provide(ServicesLive));

const ApiRoutes = HttpApiBuilder.layer(Api, {
	openapiPath: "/openapi.json",
}).pipe(
	Layer.provide([
		AuthApiHandlers,
		UsersApiHandlers,
		ListingsApiHandlers,
		FavoritesApiHandlers,
	]),
);

const DocsRoute = HttpApiScalar.layer(Api, { path: "/docs" });

const AllRoutes = Layer.mergeAll(ApiRoutes, DocsRoute);

const HttpServerLayer = HttpRouter.serve(AllRoutes, {
	middleware: (app) =>
		app.pipe(
			RequestLoggerMiddleware,
			HttpMiddleware.cors({
				allowedOrigins: [
					"http://localhost:3001",
					"https://easyrent-fe-eight.vercel.app",
				],
				allowedMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
				allowedHeaders: [
					"Content-Type",
					"Authorization",
					"traceparent",
					"tracestate",
					"b3",
					"x-b3-traceid",
					"x-b3-spanid",
					"x-b3-sampled",
					"baggage",
				],
				credentials: true,
			}),
		),
}).pipe(Layer.provide(BunHttpServer.layer({ port: 3000 })));

const AppLayer = HttpServerLayer.pipe(
	Layer.provide(AuthLive),
	Layer.provide(ServicesLive),
	Layer.provide(RepositoriesLive),
	Layer.provide(CacheLive),
	Layer.provide(RedisLive),
	Layer.provide(LoggerService.layer),
	Layer.provide(InfraLive),
);

BunRuntime.runMain(Layer.launch(AppLayer));
