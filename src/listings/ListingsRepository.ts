import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core";
import { Effect, Context, Option, Layer } from "effect";
import { PgDatabase } from "../db";
import { listingMedia, listings } from "../db/schema";
import { eq, sql, and } from "drizzle-orm";

type DbEffect<A> = Effect.Effect<A, EffectDrizzleQueryError>;

export interface CreateListingParams {
	landlordId: string;
	title: string;
	description: string;
	price: string;
	rooms: number;
	furnished: boolean;
	latitude: number;
	longitude: number;
	address: string;
}

export interface ListingRow {
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
}

export interface ListingMediaRow {
	id: string;
	listingId: string;
	url: string;
	type: "image" | "video";
	order: number;
	createdAt: Date;
}

export interface AddMediaParams {
	listingId: string;
	url: string;
	type: "image" | "video";
	order: number;
}

export class ListingRepository extends Context.Service<
	ListingRepository,
	{
		readonly create: (params: CreateListingParams) => DbEffect<ListingRow>;
		readonly findById: (id: string) => DbEffect<Option.Option<ListingRow>>;
		readonly findByIdWithMedia: (
			id: string,
		) => DbEffect<Option.Option<ListingRow & { media: ListingMediaRow[] }>>;
		readonly findAll: (filters?: {
			status?: "avaiable" | "rented" | "inative";
			minPrice?: number;
			maxPrice?: number;
		}) => DbEffect<ListingRow[]>;
		readonly findByLandlord: (landlordId: string) => DbEffect<ListingRow[]>;
		readonly addMedia: (params: AddMediaParams) => DbEffect<ListingMediaRow>;
		readonly deleteMedia: (mediaId: string) => DbEffect<void>;
		readonly update: (
			id: string,
			params: Partial<Omit<CreateListingParams, "landlordId">>,
		) => DbEffect<Option.Option<ListingRow>>;
		readonly delete: (id: string) => DbEffect<void>;
	}
>()("easyrent/listings/ListingsRepository/ListingRepository") {
	static readonly layer = Layer.effect(
		ListingRepository,
		Effect.gen(function* () {
			const db = yield* PgDatabase;

			const create = Effect.fn("ListingsRepository.create")(
				(params: CreateListingParams): DbEffect<ListingRow> =>
					Effect.gen(function* () {
						const rows = yield* db
							.insert(listings)
							.values({
								landlordId: params.landlordId,
								title: params.title,
								description: params.description,
								price: params.price,
								rooms: params.rooms,
								furnished: params.furnished,
								address: params.address,
								location: sql`ST_SetSRID(ST_MakePoint(${params.longitude}, ${params.latitude}), 4326)`,
							})
							.returning();
						return rows[0]!;
					}),
			);

			const findById = Effect.fn("ListRepository.findById")(
				(id: string): DbEffect<Option.Option<ListingRow>> =>
					Effect.gen(function* () {
						const rows = yield* db
							.select()
							.from(listings)
							.where(eq(listings.id, id))
							.limit(1);
						return Option.fromNullishOr(rows[0] ?? null);
					}),
			);

			const findByIdWithMedia = Effect.fn("ListingRepositoy.findByIdWithMedia")(
				(
					id: string,
				): DbEffect<
					Option.Option<
						ListingRow & {
							media: ListingMediaRow[];
						}
					>
				> =>
					Effect.gen(function* () {
						const rows = yield* db
							.select()
							.from(listings)
							.where(eq(listings.id, id))
							.limit(1);
						if (!rows[0]) return Option.none();
						const media = yield* db
							.select()
							.from(listingMedia)
							.where(eq(listingMedia.listingId, id))
							.orderBy(listingMedia.order);
						return Option.some({
							...rows[0],
							media,
						});
					}),
			);

			const findAll = Effect.fn("ListingsRepository.findAll")(
				(filters?: {
					status?: "avaiable" | "rented" | "inative";
					minPrice?: number;
					maxPrice?: number;
				}): DbEffect<ListingRow[]> =>
					Effect.gen(function* () {
						const query = db.select().from(listings);
						const conditions = [];

						if (filters?.status) {
							conditions.push(eq(listings.status, filters.status));
						}

						return yield* conditions.length > 0
							? query.where(and(...conditions))
							: query;
					}),
			);

			const findByLandlord = Effect.fn("ListingsRepository.findByLandlord")(
				(landlordId: string): DbEffect<ListingRow[]> =>
					Effect.gen(function* () {
						return yield* db
							.select()
							.from(listings)
							.where(eq(listings.landlordId, landlordId));
					}),
			);

			const addMedia = Effect.fn("ListingsRepository.addMedia")(
				(params: AddMediaParams): DbEffect<ListingMediaRow> =>
					Effect.gen(function* () {
						const rows = yield* db
							.insert(listingMedia)
							.values({
								listingId: params.listingId,
								url: params.url,
								type: params.type,
								order: params.order,
							})
							.returning();
						return rows[0]!;
					}),
			);

			const deleteMedia = Effect.fn("ListingsRepository.deleteMedia")(
				(mediaId: string): DbEffect<void> =>
					Effect.gen(function* () {
						yield* db.delete(listingMedia).where(eq(listingMedia.id, mediaId));
					}),
			);

			const update = Effect.fn("ListingsRepository.update")(
				(
					id: string,
					params: Partial<Omit<CreateListingParams, "landlordId">>,
				): DbEffect<Option.Option<ListingRow>> =>
					Effect.gen(function* () {
						const updateData: Record<string, unknown> = {
							updatedAt: new Date(),
						};

						if (params.title) updateData.title = params.title;
						if (params.description) updateData.description = params.description;
						if (params.price) updateData.price = params.price;
						if (params.rooms !== undefined) updateData.rooms = params.rooms;
						if (params.furnished !== undefined)
							updateData.furnished = params.furnished;
						if (params.address) updateData.address = params.address;
						if (params.latitude && params.longitude) {
							updateData.location = sql`ST_SetSRID(ST_MakePoint(${params.longitude}, ${params.latitude}), 4326)`;
						}

						const rows = yield* db
							.update(listings)
							.set(updateData)
							.where(eq(listings.id, id))
							.returning();

						return Option.fromNullishOr(rows[0] ?? null);
					}),
			);

			const deleteListing = Effect.fn("ListingsRepository.delete")(
				(id: string): DbEffect<void> =>
					Effect.gen(function* () {
						yield* db.delete(listings).where(eq(listings.id, id));
					}),
			);

			return {
				create,
				findById,
				findByIdWithMedia,
				findAll,
				findByLandlord,
				addMedia,
				deleteMedia,
				update,
				delete: deleteListing,
			};
		}),
	);
}
