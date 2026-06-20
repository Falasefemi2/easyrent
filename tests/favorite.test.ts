import { describe, expect, it } from "@effect/vitest";
import { Cause, Effect, Exit, Layer, Option } from "effect";
import {
	type FavoriteListingRow,
	FavoritesRepository,
} from "../src/favorites/FavoritesRepository";
import { FavoritesService } from "../src/favorites/FavoritesService";
import type { ListingRow } from "../src/listings/ListingsRepository";

const seedListings = new Map<string, ListingRow>([
	[
		"listing-1",
		{
			id: "listing-1",
			landlordId: "landlord-123",
			title: "Test Flat",
			description: "Nice flat in Lagos",
			price: "500000",
			rooms: 2,
			furnished: true,
			status: "avaiable",
			address: "Lekki, Lagos",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			favoriteCount: 0,
		},
	],
	[
		"listing-2",
		{
			id: "listing-2",
			landlordId: "landlord-456",
			title: "Studio Apartment",
			description: "Cozy studio in VI",
			price: "250000",
			rooms: 1,
			furnished: false,
			status: "avaiable",
			address: "Victoria Island, Lagos",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			favoriteCount: 0,
		},
	],
]);

export const makeTestFavoritesRepository = () =>
	Layer.succeed(
		FavoritesRepository,
		(() => {
			const favoritesStore = new Map<
				string,
				{ userId: string; listingId: string; createdAt: string }
			>();
			const key = (userId: string, listingId: string) =>
				`${userId}:${listingId}`;
			return {
				add: (userId, listingId) =>
					Effect.sync(() => {
						favoritesStore.set(key(userId, listingId), {
							userId,
							listingId,
							createdAt: new Date().toISOString(),
						});
					}),

				remove: (userId, listingId) =>
					Effect.sync(() => {
						favoritesStore.delete(key(userId, listingId));
					}),

				exists: (userId, listingId) =>
					Effect.succeed(favoritesStore.has(key(userId, listingId))),

				findByUser: (userId, pagination) =>
					Effect.sync(() => {
						const { page, limit } = pagination;
						const offset = (page - 1) * limit;

						const userFavs = Array.from(favoritesStore.values()).filter(
							(f) => f.userId === userId,
						);

						const paginated = userFavs.slice(offset, offset + limit);

						const data: FavoriteListingRow[] = paginated.map((fav) => {
							const listing = seedListings.get(fav.listingId)!;
							const favoriteCount = Array.from(favoritesStore.values()).filter(
								(f) => f.listingId === fav.listingId,
							).length;

							return {
								...listing,
								media: [],
								favoriteCount,
								favoritedAt: fav.createdAt,
							};
						});

						return {
							data,
							total: userFavs.length,
							page,
							limit,
							totalPages: Math.ceil(userFavs.length / limit),
						};
					}),

				countForListing: (listingId) =>
					Effect.succeed(
						Array.from(favoritesStore.values()).filter(
							(f) => f.listingId === listingId,
						).length,
					),
			};
		})(),
	);

const testLayer = FavoritesService.layer.pipe(
	Layer.provideMerge(makeTestFavoritesRepository()),
);

const makeTestLayer = () =>
	FavoritesService.layer.pipe(
		Layer.provideMerge(makeTestFavoritesRepository()),
	);

describe("FavoritesService", () => {
	describe("add", () => {
		it.effect("adds a listing to favorites", () =>
			Effect.gen(function* () {
				const favService = yield* FavoritesService;
				yield* favService.add("user-123", "listing-1");
				const favorited = yield* favService.isFavorited(
					"user-123",
					"listing-1",
				);
				expect(favorited).toBe(true);
			}).pipe(Effect.provide(makeTestLayer())),
		);

		it.effect("fails with AlreadyFavorited on duplicate", () =>
			Effect.gen(function* () {
				const favService = yield* FavoritesService;
				yield* favService.add("user-123", "listing-1");
				const result = yield* favService
					.add("user-123", "listing-1")
					.pipe(Effect.exit);

				expect(Exit.isFailure(result)).toBe(true);
				if (Exit.isFailure(result)) {
					const error = Cause.findErrorOption(result.cause);
					expect(Option.isSome(error)).toBe(true);
					if (Option.isSome(error)) {
						expect((error.value as any)._tag).toBe("AlreadyFavorited");
					}
				}
			}).pipe(Effect.provide(testLayer)),
		);
	});

	describe("remove", () => {
		it.effect("removes a listing from favorites", () =>
			Effect.gen(function* () {
				const favService = yield* FavoritesService;
				yield* favService.add("user-123", "listing-1");
				yield* favService.remove("user-123", "listing-1");
				const favorited = yield* favService.isFavorited(
					"user-123",
					"listing-1",
				);
				expect(favorited).toBe(false);
			}).pipe(Effect.provide(makeTestLayer())),
		);

		it.effect("fails with FavoriteNotFound when not favorited", () =>
			Effect.gen(function* () {
				const favService = yield* FavoritesService;
				const result = yield* favService
					.remove("user-123", "listing-2")
					.pipe(Effect.exit);

				expect(Exit.isFailure(result)).toBe(true);
				if (Exit.isFailure(result)) {
					const error = Cause.findErrorOption(result.cause);
					expect(Option.isSome(error)).toBe(true);
					if (Option.isSome(error)) {
						expect((error.value as any)._tag).toBe("FavoriteNotFound");
					}
				}
			}).pipe(Effect.provide(makeTestLayer())),
		);
	});

	describe("getMyFavorites", () => {
		it.effect("returns paginated favorites with listing details", () =>
			Effect.gen(function* () {
				const favService = yield* FavoritesService;
				yield* favService.add("user-123", "listing-1");
				yield* favService.add("user-123", "listing-2");
				const result = yield* favService.getMyFavorites("user-123", {
					page: 1,
					limit: 10,
				});
				expect(result.total).toBe(2);
				expect(result.data).toHaveLength(2);
				expect(result.data[0]?.title).toBeDefined();
				expect(result.data[0]?.media).toEqual([]);
			}).pipe(Effect.provide(makeTestLayer())),
		);

		it.effect("returns empty for user with no favorites", () =>
			Effect.gen(function* () {
				const favService = yield* FavoritesService;
				const result = yield* favService.getMyFavorites("user-with-no-favs", {
					page: 1,
					limit: 10,
				});
				expect(result.total).toBe(0);
				expect(result.data).toHaveLength(0);
			}).pipe(Effect.provide(makeTestLayer())),
		);
	});

	describe("isFavorited", () => {
		it.effect("returns true when favorited", () =>
			Effect.gen(function* () {
				const favService = yield* FavoritesService;
				yield* favService.add("user-123", "listing-1");
				const result = yield* favService.isFavorited("user-123", "listing-1");
				expect(result).toBe(true);
			}).pipe(Effect.provide(makeTestLayer())),
		);

		it.effect("returns false when not favorited", () =>
			Effect.gen(function* () {
				const favService = yield* FavoritesService;
				const result = yield* favService.isFavorited("user-123", "listing-2");
				expect(result).toBe(false);
			}).pipe(Effect.provide(makeTestLayer())),
		);
	});
});
