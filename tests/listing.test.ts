import { Layer, Effect, Option, Exit, Cause } from "effect";
import {
	ListingRepository,
	type CreateListingParams,
	type ListingMediaRow,
	type ListingRow,
} from "../src/listings/ListingsRepository";
import { ImageUploadService } from "../src/services/UploadThingService";
import { ListingService } from "../src/listings/ListingsService";
import { CacheService } from "../src/services/CacheService";
import { describe, it, expect } from "@effect/vitest";

const makeTestListingRepository = Layer.succeed(
	ListingRepository,
	(() => {
		const listingsStore = new Map<string, ListingRow>();
		const mediaStore = new Map<string, ListingMediaRow[]>();

		const toRow = (params: CreateListingParams, id: string): ListingRow => ({
			id,
			landlordId: params.landlordId,
			title: params.title,
			description: params.description,
			price: params.price,
			rooms: params.rooms,
			furnished: params.furnished,
			status: "avaiable",
			address: params.address,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			favoriteCount: 0,
		});

		return {
			create: (params) =>
				Effect.sync(() => {
					const id = crypto.randomUUID();
					const row = toRow(params, id);
					listingsStore.set(id, row);
					mediaStore.set(id, []);
					return row;
				}),

			findById: (id) =>
				Effect.succeed(Option.fromNullOr(listingsStore.get(id) ?? null)),

			findByIdWithMedia: (id) =>
				Effect.sync(() => {
					const listing = listingsStore.get(id);
					if (!listing) return Option.none();
					return Option.some({
						...listing,
						media: mediaStore.get(id) ?? [],
					});
				}),

			findAll: (pagination, _filters) =>
				Effect.sync(() => {
					const all = Array.from(listingsStore.values());
					const { page, limit } = pagination;
					const offset = (page - 1) * limit;
					const data = all.slice(offset, offset + limit);
					return {
						data,
						total: all.length,
						page,
						limit,
						totalPages: Math.ceil(all.length / limit),
					};
				}),

			findByLandlord: (landlordId, pagination) =>
				Effect.sync(() => {
					const all = Array.from(listingsStore.values()).filter(
						(l) => l.landlordId === landlordId,
					);
					const { page, limit } = pagination;
					const offset = (page - 1) * limit;
					const data = all.slice(offset, offset + limit);
					return {
						data,
						total: all.length,
						page,
						limit,
						totalPages: Math.ceil(all.length / limit),
					};
				}),

			addMedia: (params) =>
				Effect.sync(() => {
					const media: ListingMediaRow = {
						id: crypto.randomUUID(),
						listingId: params.listingId,
						url: params.url,
						type: params.type,
						order: params.order,
						createdAt: new Date().toISOString(),
					};
					const existing = mediaStore.get(params.listingId) ?? [];
					mediaStore.set(params.listingId, [...existing, media]);
					return media;
				}),

			deleteMedia: (mediaId) =>
				Effect.sync(() => {
					for (const [listingId, media] of mediaStore.entries()) {
						mediaStore.set(
							listingId,
							media.filter((m) => m.id !== mediaId),
						);
					}
				}),

			update: (id, params) =>
				Effect.sync(() => {
					const existing = listingsStore.get(id);
					if (!existing) return Option.none();
					const updated: ListingRow = {
						...existing,
						...params,
						updatedAt: new Date().toISOString(),
					};
					listingsStore.set(id, updated);
					return Option.some(updated);
				}),

			delete: (id) =>
				Effect.sync(() => {
					listingsStore.delete(id);
					mediaStore.delete(id);
				}),
		};
	})(),
);

const TestImageUploadService = Layer.succeed(ImageUploadService, {
	uploadFile: (_fileName, _filePath) =>
		Effect.succeed("https://fake-cloudinary.com/test-image.jpg"),
});

const TestCacheService = Layer.succeed(CacheService, {
	getJson: <T>(_key: string) => Effect.succeed<T | null>(null),
	setJson: (_key, _value, _ttl) => Effect.void,
	invalidate: (_key) => Effect.void,
	invalidateListings: () => Effect.void,
	invalidateListing: (_id) => Effect.void,
});

const testLayer = ListingService.layer.pipe(
	Layer.provideMerge(makeTestListingRepository),
	Layer.provideMerge(TestImageUploadService),
	Layer.provideMerge(TestCacheService),
);

describe("ListingService", () => {
	describe("create", () => {
		it.effect("creates listing and returns data", () =>
			Effect.gen(function* () {
				const listingService = yield* ListingService;

				const result = yield* listingService.create({
					landlordId: "landlord-123",
					title: "New Bedroom Flat",
					description: "Very big house with parking",
					price: "120000",
					rooms: 3,
					furnished: false,
					latitude: 6.5244,
					longitude: 3.3792,
					address: "Lagos, Nigeria",
				});

				expect(result.title).toBe("New Bedroom Flat");
				expect(result.address).toBe("Lagos, Nigeria");
				expect(result.landlordId).toBe("landlord-123");
				expect(result.rooms).toBe(3);
				expect(result.id).toBeDefined();
				expect(result.favoriteCount).toBe(0);
			}).pipe(Effect.provide(testLayer)),
		);
	});

	describe("getById", () => {
		it.effect("returns listing with media", () =>
			Effect.gen(function* () {
				const listingService = yield* ListingService;

				const created = yield* listingService.create({
					landlordId: "landlord-123",
					title: "Test Flat",
					description: "Nice flat in Lagos",
					price: "500000",
					rooms: 2,
					furnished: true,
					latitude: 6.5244,
					longitude: 3.3792,
					address: "Lekki, Lagos",
				});

				const result = yield* listingService.getById(created.id);

				expect(result.id).toBe(created.id);
				expect(result.media).toEqual([]);
			}).pipe(Effect.provide(testLayer)),
		);

		it.effect("fails with ListingNotFound for unknown id", () =>
			Effect.gen(function* () {
				const listingService = yield* ListingService;

				const result = yield* listingService
					.getById("non-existent-id")
					.pipe(Effect.exit);

				expect(Exit.isFailure(result)).toBe(true);
				if (Exit.isFailure(result)) {
					const error = Cause.findErrorOption(result.cause);
					expect(Option.isSome(error)).toBe(true);
					if (Option.isSome(error)) {
						expect((error.value as any)._tag).toBe("ListingNotFound");
					}
				}
			}).pipe(Effect.provide(testLayer)),
		);
	});

	describe("update", () => {
		it.effect("updates listing fields", () =>
			Effect.gen(function* () {
				const listingService = yield* ListingService;

				const created = yield* listingService.create({
					landlordId: "landlord-123",
					title: "Old Title",
					description: "Old description here",
					price: "100000",
					rooms: 1,
					furnished: false,
					latitude: 6.5244,
					longitude: 3.3792,
					address: "Old Address",
				});

				const updated = yield* listingService.update(
					created.id,
					"landlord-123",
					{ title: "New Title", price: "200000" },
				);

				expect(updated.title).toBe("New Title");
				expect(updated.price).toBe("200000");
			}).pipe(Effect.provide(testLayer)),
		);

		it.effect("fails with ListingForbidden for wrong landlord", () =>
			Effect.gen(function* () {
				const listingService = yield* ListingService;

				const created = yield* listingService.create({
					landlordId: "landlord-123",
					title: "Test Flat",
					description: "Nice flat description",
					price: "100000",
					rooms: 2,
					furnished: false,
					latitude: 6.5244,
					longitude: 3.3792,
					address: "Lagos",
				});

				const result = yield* listingService
					.update(created.id, "wrong-landlord", { title: "Hacked" })
					.pipe(Effect.exit);

				expect(Exit.isFailure(result)).toBe(true);
				if (Exit.isFailure(result)) {
					const error = Cause.findErrorOption(result.cause);
					expect(Option.isSome(error)).toBe(true);
					if (Option.isSome(error)) {
						expect((error.value as any)._tag).toBe("ListingForbidden");
					}
				}
			}).pipe(Effect.provide(testLayer)),
		);
	});

	describe("delete", () => {
		it.effect("deletes listing successfully", () =>
			Effect.gen(function* () {
				const listingService = yield* ListingService;

				const created = yield* listingService.create({
					landlordId: "landlord-123",
					title: "To Delete",
					description: "This will be deleted soon",
					price: "100000",
					rooms: 1,
					furnished: false,
					latitude: 6.5244,
					longitude: 3.3792,
					address: "Lagos",
				});

				yield* listingService.delete(created.id, "landlord-123");

				const result = yield* listingService
					.getById(created.id)
					.pipe(Effect.exit);

				expect(Exit.isFailure(result)).toBe(true);
			}).pipe(Effect.provide(testLayer)),
		);
	});
});
