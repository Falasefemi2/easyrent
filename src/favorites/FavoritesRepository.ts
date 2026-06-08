import { Context, Effect, Layer } from "effect";
import { eq, and, desc, count, inArray, sql } from "drizzle-orm";
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
	row: {
		id: string;
		landlordId: string;
		title: string;
		description: string;
		price: string;
		rooms: number | null;
		furnished: boolean;
		status: "avaiable" | "rented" | "inative" | null;
		address: string;
		createdAt: Date;
		updatedAt: Date;
		latitude?: number | null;
		longitude?: number | null;
		coverImage?: string | null;
	},
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
	latitude: row.latitude ?? null,
	longitude: row.longitude ?? null,
	coverImage: row.coverImage ?? null,
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

						const listingIds = favRows.map((f) => f.listingId);

						// Fetch listings with lat/lng extracted
						const listingRows = yield* db
							.select({
								id: listings.id,
								landlordId: listings.landlordId,
								title: listings.title,
								description: listings.description,
								price: listings.price,
								rooms: listings.rooms,
								furnished: listings.furnished,
								status: listings.status,
								address: listings.address,
								createdAt: listings.createdAt,
								updatedAt: listings.updatedAt,
								latitude: sql<number>`ST_Y(${listings.location}::geometry)`,
								longitude: sql<number>`ST_X(${listings.location}::geometry)`,
							})
							.from(listings)
							.where(inArray(listings.id, listingIds));

						// Fetch media
						const mediaRows = yield* db
							.select()
							.from(listingMedia)
							.where(inArray(listingMedia.listingId, listingIds))
							.orderBy(listingMedia.order);

						// Fetch favorite counts
						const countRows = yield* db
							.select({ listingId: favorites.listingId, count: count() })
							.from(favorites)
							.where(inArray(favorites.listingId, listingIds))
							.groupBy(favorites.listingId);

						// Fetch cover images
						const coverRows = yield* db
							.selectDistinctOn([listingMedia.listingId], {
								listingId: listingMedia.listingId,
								url: listingMedia.url,
							})
							.from(listingMedia)
							.where(inArray(listingMedia.listingId, listingIds))
							.orderBy(listingMedia.listingId, listingMedia.order);

						const mediaMap = listingIds.reduce(
							(acc, id) => {
								acc[id] = mediaRows
									.filter((m) => m.listingId === id)
									.map(toMediaRow);
								return acc;
							},
							{} as Record<string, ListingMediaRow[]>,
						);

						const countMap = Object.fromEntries(
							countRows.map((r) => [r.listingId, Number(r.count)]),
						);

						const coverMap = Object.fromEntries(
							coverRows.map((r) => [r.listingId, r.url]),
						);

						const listingMap = Object.fromEntries(
							listingRows.map((r) => [r.id, r]),
						);

						const data: FavoriteListingRow[] = favRows.map((fav) => {
							const listing = listingMap[fav.listingId]!;
							return {
								...toListingRow(
									{ ...listing, coverImage: coverMap[fav.listingId] ?? null },
									countMap[fav.listingId] ?? 0,
								),
								media: mediaMap[fav.listingId] ?? [],
								favoritedAt: fav.createdAt.toISOString(),
							};
						});

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
