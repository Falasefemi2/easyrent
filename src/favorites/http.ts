import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { Api } from "../auth/Api";
import { CurrentUser } from "../auth/Authorization";
import { AuthorizationLayer } from "../auth/Authorization";
import { FavoritesService } from "./FavoritesService";
import { FavoritesRepository } from "./FavoritesRepository";
import { TokenService } from "../auth/TokenService";
import { AuthConfig } from "../auth/AuthConfig";
import { DatabaseLive } from "../db";

export const FavoritesApiHandlers = HttpApiBuilder.group(
	Api,
	"favorites",
	Effect.fn(function* (handlers) {
		const favoritesService = yield* FavoritesService;

		return handlers
			.handle("add", ({ params }) =>
				Effect.gen(function* () {
					const user = yield* CurrentUser;
					yield* favoritesService.add(user.userId, params.listingId);
				}),
			)
			.handle("remove", ({ params }) =>
				Effect.gen(function* () {
					const user = yield* CurrentUser;
					yield* favoritesService.remove(user.userId, params.listingId);
				}),
			)
			.handle("myFavorites", ({ query }) =>
				Effect.gen(function* () {
					const user = yield* CurrentUser;
					return yield* favoritesService.getMyFavorites(user.userId, {
						page: query.page ?? 1,
						limit: query.limit ?? 20,
					});
				}),
			)
			.handle("isFavorited", ({ params }) =>
				Effect.gen(function* () {
					const user = yield* CurrentUser;
					const favorited = yield* favoritesService.isFavorited(
						user.userId,
						params.listingId,
					);
					return { favorited };
				}),
			);
	}),
).pipe(
	Layer.provide(AuthorizationLayer),
	Layer.provide(FavoritesService.layer),
	Layer.provide(FavoritesRepository.layer),
	Layer.provide(TokenService.layer),
	Layer.provide(AuthConfig.layer),
	Layer.provide(DatabaseLive),
);
