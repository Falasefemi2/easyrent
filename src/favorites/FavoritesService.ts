import { Context, Effect, Layer } from "effect";
import {
	FavoritesRepository,
	type FavoriteListingRow,
} from "./FavoritesRepository";
import { AlreadyFavorited, FavoriteNotFound } from "./FavoritesError";
import type {
	PaginationParams,
	PaginatedResult,
} from "../listings/ListingsRepository";

export class FavoritesService extends Context.Service<
	FavoritesService,
	{
		readonly add: (
			userId: string,
			listingId: string,
		) => Effect.Effect<void, AlreadyFavorited>;

		readonly remove: (
			userId: string,
			listingId: string,
		) => Effect.Effect<void, FavoriteNotFound>;

		readonly getMyFavorites: (
			userId: string,
			pagination: PaginationParams,
		) => Effect.Effect<PaginatedResult<FavoriteListingRow>>;

		readonly isFavorited: (
			userId: string,
			listingId: string,
		) => Effect.Effect<boolean>;
	}
>()("easyrent/favorites/FavoritesService") {
	static readonly layer = Layer.effect(
		FavoritesService,
		Effect.gen(function* () {
			const repo = yield* FavoritesRepository;

			const add = Effect.fn("FavoritesService.add")(
				(
					userId: string,
					listingId: string,
				): Effect.Effect<void, AlreadyFavorited> =>
					Effect.gen(function* () {
						const already = yield* repo
							.exists(userId, listingId)
							.pipe(Effect.orDie);

						if (already) {
							return yield* new AlreadyFavorited({
								message: "Listing already in favorites",
							});
						}

						yield* repo.add(userId, listingId).pipe(Effect.orDie);
					}),
			);

			const remove = Effect.fn("FavoritesService.remove")(
				(
					userId: string,
					listingId: string,
				): Effect.Effect<void, FavoriteNotFound> =>
					Effect.gen(function* () {
						const exists = yield* repo
							.exists(userId, listingId)
							.pipe(Effect.orDie);

						if (!exists) {
							return yield* new FavoriteNotFound({
								message: "Listing not in favorites",
							});
						}

						yield* repo.remove(userId, listingId).pipe(Effect.orDie);
					}),
			);

			const getMyFavorites = Effect.fn("FavoritesService.getMyFavorites")(
				(
					userId: string,
					pagination: PaginationParams,
				): Effect.Effect<PaginatedResult<FavoriteListingRow>> =>
					repo.findByUser(userId, pagination).pipe(Effect.orDie),
			);

			const isFavorited = Effect.fn("FavoritesService.isFavorited")(
				(userId: string, listingId: string): Effect.Effect<boolean> =>
					repo.exists(userId, listingId).pipe(Effect.orDie),
			);

			return { add, remove, getMyFavorites, isFavorited };
		}),
	);
}
