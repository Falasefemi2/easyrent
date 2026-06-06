import { Context, Effect, Layer } from "effect";
import { eq, and, desc, count } from "drizzle-orm";
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core";
import type {
	ListingMediaRow,
	ListingRow,
	PaginatedResult,
	PaginationParams,
} from "../listings/ListingsRepository";
import { favorites, listingMedia, listings } from "../db/schema";
import { PgDatabase } from "../db";

type DbEffect<A> = Effect.Effect<A, EffectDrizzleQueryError>;

export interface FavoriteListingRow extends ListingRow {
	media: ListingMediaRow[];
	favoriteCount: number;
	favoritedAt: string;
}

const toListingRow = (
	row: typeof listings.$inferSelect,
	favoriteCount = 0,
): ListingRow => ({
	id: row.id,
	landlordId: row.landlordId,
	title: row.title,
	description: row.description,
	price: row.price,
	rooms: row.rooms,
	furnished: row.furnished,
	status: row.status,
	address: row.address,
	createdAt: row.createdAt.toISOString(),
	updatedAt: row.updatedAt.toISOString(),
	favoriteCount,
});

const toMediaRow = (
	row: typeof listingMedia.$inferSelect,
): ListingMediaRow => ({
	id: row.id,
	listingId: row.listingId,
	url: row.url,
	type: row.type,
	order: row.order,
	createdAt: row.createdAt.toISOString(),
});

export class FavoritesRepository extends Context.Service<
	FavoritesRepository,
	{
		readonly add: (userId: string, listingId: string) => DbEffect<void>;

		readonly remove: (userId: string, listingId: string) => DbEffect<void>;

		readonly exists: (userId: string, listingId: string) => DbEffect<boolean>;

		readonly findByUser: (
			userId: string,
			pagination: PaginationParams,
		) => DbEffect<PaginatedResult<FavoriteListingRow>>;

		readonly countForListing: (listingId: string) => DbEffect<number>;
	}
>()("easyrent/favorites/FavoritesRepository") {
	static readonly layer = Layer.effect(
		FavoritesRepository,
		Effect.gen(function* () {
			const db = yield* PgDatabase;

			const add = Effect.fn("FavoritesRepository.add")(
				(userId: string, listingId: string): DbEffect<void> =>
					db.insert(favorites).values({ userId, listingId }),
			);

			const remove = Effect.fn("FavoritesRepository.remove")(
				(userId: string, listingId: string): DbEffect<void> =>
					db
						.delete(favorites)
						.where(
							and(
								eq(favorites.userId, userId),
								eq(favorites.listingId, listingId),
							),
						),
			);

			const exists = Effect.fn("FavoritesRepository.exists")(
				(userId: string, listingId: string): DbEffect<boolean> =>
					Effect.gen(function* () {
						const rows = yield* db
							.select()
							.from(favorites)
							.where(
								and(
									eq(favorites.userId, userId),
									eq(favorites.listingId, listingId),
								),
							)
							.limit(1);
						return rows.length > 0;
					}),
			);

			const findByUser = Effect.fn("FavoritesRepository.findByUser")(
				(
					userId: string,
					pagination: PaginationParams,
				): DbEffect<PaginatedResult<FavoriteListingRow>> =>
					Effect.gen(function* () {
						const { page, limit } = pagination;
						const offset = (page - 1) * limit;

						// Get favorited listing IDs with pagination
						const [favRows, totalRows] = yield* Effect.all([
							db
								.select()
								.from(favorites)
								.where(eq(favorites.userId, userId))
								.limit(limit)
								.offset(offset)
								.orderBy(desc(favorites.createdAt)),
							db
								.select({ count: count() })
								.from(favorites)
								.where(eq(favorites.userId, userId)),
						]);

						const total = Number(totalRows[0]?.count ?? 0);

						if (favRows.length === 0) {
							return { data: [], total, page, limit, totalPages: 0 };
						}

						// const listingIds = favRows.map((f) => f.listingId);

						// Fetch full listing details + media + favorite count for each
						const data = yield* Effect.all(
							favRows.map((fav) =>
								Effect.gen(function* () {
									const [listingRows, mediaRows, countRows] = yield* Effect.all(
										[
											db
												.select()
												.from(listings)
												.where(eq(listings.id, fav.listingId))
												.limit(1),
											db
												.select()
												.from(listingMedia)
												.where(eq(listingMedia.listingId, fav.listingId))
												.orderBy(listingMedia.order),
											db
												.select({ count: count() })
												.from(favorites)
												.where(eq(favorites.listingId, fav.listingId)),
										],
									);

									return {
										...toListingRow(listingRows[0]!),
										media: mediaRows.map(toMediaRow),
										favoriteCount: Number(countRows[0]?.count ?? 0),
										favoritedAt: fav.createdAt.toISOString(),
									} satisfies FavoriteListingRow;
								}),
							),
						);

						return {
							data,
							total,
							page,
							limit,
							totalPages: Math.ceil(total / limit),
						};
					}),
			);

			const countForListing = Effect.fn("FavoritesRepository.countForListing")(
				(listingId: string): DbEffect<number> =>
					Effect.gen(function* () {
						const rows = yield* db
							.select({ count: count() })
							.from(favorites)
							.where(eq(favorites.listingId, listingId));
						return Number(rows[0]?.count ?? 0);
					}),
			);

			return { add, remove, exists, findByUser, countForListing };
		}),
	);
}
