import { Context, Effect, Layer, Option } from "effect";
import {
	ImageUploadService,
	type ImageUploadError,
} from "../services/UploadThingService";
import { ListingForbidden, ListingNotFound } from "./ListingsError";
import {
	ListingRepository,
	type CreateListingParams,
	type ListingMediaRow,
	type ListingRow,
	type PaginatedResult,
	type PaginationParams,
} from "./ListingsRepository";
import { CACHE_TTL, CacheKeys, CacheService } from "../services/CacheService";

export class ListingService extends Context.Service<
	ListingService,
	{
		readonly create: (params: CreateListingParams) => Effect.Effect<ListingRow>;

		readonly getById: (id: string) => Effect.Effect<
			ListingRow & {
				media: ListingMediaRow[];
				landlordPhone: string | null;
				landlordName: string | null;
			},
			ListingNotFound
		>;

		readonly getAll: (
			pagination: PaginationParams,
			filters?: {
				status?: "avaiable" | "rented" | "inative";
				furnished?: boolean;
				minRooms?: number;
				rooms?: number;
				search?: string;
			},
		) => Effect.Effect<PaginatedResult<ListingRow>>;

		readonly getMyListings: (
			landlordId: string,
			pagination: PaginationParams,
		) => Effect.Effect<PaginatedResult<ListingRow>>;

		readonly uploadMedia: (params: {
			listingId: string;
			landlordId: string;
			fileName: string;
			filePath: string;
			type: "image" | "video";
			order: number;
		}) => Effect.Effect<
			ListingMediaRow,
			ListingNotFound | ListingForbidden | ImageUploadError
		>;

		readonly update: (
			id: string,
			landlordId: string,
			params: Partial<Omit<CreateListingParams, "landlordId">>,
		) => Effect.Effect<ListingRow, ListingNotFound | ListingForbidden>;

		readonly delete: (
			id: string,
			landlordId: string,
		) => Effect.Effect<void, ListingNotFound | ListingForbidden>;
	}
>()("easyrent/listings/ListingsService/ListingService") {
	static readonly layer = Layer.effect(
		ListingService,
		Effect.gen(function* () {
			const repo = yield* ListingRepository;
			const imageUpload = yield* ImageUploadService;
			const cache = yield* CacheService;

			const assertOwner = (listing: ListingRow, landlordId: string) =>
				listing.landlordId !== landlordId
					? Effect.fail(
							new ListingForbidden({
								message: "You don't own this listing",
							}),
						)
					: Effect.void;

			const create = Effect.fn("ListingService.create")(
				(params: CreateListingParams): Effect.Effect<ListingRow> =>
					Effect.gen(function* () {
						const listing = yield* repo.create(params).pipe(Effect.orDie);
						yield* cache.invalidateListings();
						return listing;
					}),
			);

			const getById = Effect.fn("ListingService.getById")(
				(
					id: string,
				): Effect.Effect<
					ListingRow & {
						media: ListingMediaRow[];
						landlordPhone: string | null;
						landlordName: string | null;
					},
					ListingNotFound
				> =>
					Effect.gen(function* () {
						const key = CacheKeys.listing(id);

						const cached = yield* cache.getJson<
							ListingRow & {
								media: ListingMediaRow[];
								landlordPhone: string | null;
								landlordName: string | null;
							}
						>(key);
						if (cached) return cached;

						const maybeListing = yield* repo
							.findByIdWithMedia(id)
							.pipe(Effect.orDie);
						const listing = yield* Option.match(maybeListing, {
							onNone: () =>
								Effect.fail(
									new ListingNotFound({ message: `Listing ${id} not found` }),
								),
							onSome: Effect.succeed,
						});

						yield* cache.setJson(key, listing, CACHE_TTL.listing);

						return listing;
					}),
			);

			const getAll = Effect.fn("ListingService.getAll")(
				(
					pagination: PaginationParams,
					filters?: {
						status?: "avaiable" | "rented" | "inative";
						furnished?: boolean;
						minRooms?: number;
						rooms?: number;
					},
				): Effect.Effect<PaginatedResult<ListingRow>> =>
					Effect.gen(function* () {
						const key = CacheKeys.listings(
							pagination.page,
							pagination.limit,
							filters,
						);

						const cached =
							yield* cache.getJson<PaginatedResult<ListingRow>>(key);
						if (cached) return cached;

						const result = yield* repo
							.findAll(pagination, filters)
							.pipe(Effect.orDie);
						yield* cache.setJson(key, result, CACHE_TTL.listings);
						return result;
					}),
			);

			const getMyListings = Effect.fn("ListingService.getMyListings")(
				(
					landlordId: string,
					pagination: PaginationParams,
				): Effect.Effect<PaginatedResult<ListingRow>> =>
					repo.findByLandlord(landlordId, pagination).pipe(Effect.orDie),
			);

			const uploadMedia = Effect.fn("ListingService.uploadMedia")(
				(params: {
					listingId: string;
					landlordId: string;
					fileName: string;
					filePath: string;
					type: "image" | "video";
					order: number;
				}): Effect.Effect<
					ListingMediaRow,
					ListingNotFound | ListingForbidden | ImageUploadError
				> =>
					Effect.gen(function* () {
						const maybeListing = yield* repo
							.findById(params.listingId)
							.pipe(Effect.orDie);
						const listing = yield* Option.match(maybeListing, {
							onNone: () =>
								Effect.fail(
									new ListingNotFound({
										message: `Listing ${params.listingId} not found`,
									}),
								),
							onSome: Effect.succeed,
						});

						yield* assertOwner(listing, params.landlordId);

						const url = yield* imageUpload.uploadFile(
							params.fileName,
							params.filePath,
						);

						const media = yield* repo
							.addMedia({
								listingId: params.listingId,
								url,
								type: params.type,
								order: params.order,
							})
							.pipe(Effect.orDie);
						yield* cache.invalidateListing(params.listingId);
						return media;
					}),
			);

			const update = Effect.fn("ListingService.update")(
				(
					id: string,
					landlordId: string,
					params: Partial<Omit<CreateListingParams, "landlordId">>,
				): Effect.Effect<ListingRow, ListingNotFound | ListingForbidden> =>
					Effect.gen(function* () {
						const maybeListing = yield* repo.findById(id).pipe(Effect.orDie);
						const listing = yield* Option.match(maybeListing, {
							onNone: () =>
								Effect.fail(
									new ListingNotFound({
										message: `Listing ${id} not found`,
									}),
								),
							onSome: Effect.succeed,
						});

						yield* assertOwner(listing, landlordId);

						const updated = yield* repo.update(id, params).pipe(Effect.orDie);
						const result = yield* Option.match(updated, {
							onNone: () =>
								Effect.fail(
									new ListingNotFound({ message: `Listing ${id} not found` }),
								),
							onSome: Effect.succeed,
						});

						yield* cache.invalidateListing(id);
						return result;
					}),
			);

			const deleteListing = Effect.fn("ListingService.delete")(
				(
					id: string,
					landlordId: string,
				): Effect.Effect<void, ListingNotFound | ListingForbidden> =>
					Effect.gen(function* () {
						const maybeListing = yield* repo.findById(id).pipe(Effect.orDie);
						const listing = yield* Option.match(maybeListing, {
							onNone: () =>
								Effect.fail(
									new ListingNotFound({
										message: `Listing ${id} not found`,
									}),
								),
							onSome: Effect.succeed,
						});

						yield* assertOwner(listing, landlordId);
						yield* repo.delete(id).pipe(Effect.orDie);
						yield* cache.invalidateListing(id);
					}),
			);

			return {
				create,
				getById,
				getAll,
				getMyListings,
				uploadMedia,
				update,
				delete: deleteListing,
			};
		}),
	);
}
