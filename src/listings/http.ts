import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { HttpServerRequest } from "effect/unstable/http";
import { Api } from "../auth/Api";
import { CurrentUser } from "../auth/Authorization";
import { AuthorizationLayer } from "../auth/Authorization";
import { TokenService } from "../auth/TokenService";
import { AuthConfig } from "../auth/AuthConfig";
import { DatabaseLive } from "../db";
import { BunServices } from "@effect/platform-bun";
import type { PersistedFile } from "effect/unstable/http/Multipart";
import { ListingService } from "./ListingsService";
import {
	ImageUploadError,
	ImageUploadService,
} from "../services/UploadThingService";
import { ListingRepository } from "./ListingsRepository";

export const ListingsApiHandlers = HttpApiBuilder.group(
	Api,
	"listings",
	Effect.fn(function* (handlers) {
		const listingsService = yield* ListingService;

		return handlers
			.handle("list", () => listingsService.getAll().pipe(Effect.orDie))
			.handle("getById", ({ params }) =>
				listingsService
					.getById(params.id)
					.pipe(Effect.catchTag("ListingNotFound", Effect.die)),
			)
			.handle("create", ({ payload }) =>
				Effect.gen(function* () {
					const user = yield* CurrentUser;
					return yield* listingsService
						.create({
							...payload,
							landlordId: user.userId,
						})
						.pipe(Effect.orDie);
				}),
			)
			.handle("uploadMedia", ({ params }) =>
				Effect.gen(function* () {
					const user = yield* CurrentUser;
					const req = yield* HttpServerRequest.HttpServerRequest;

					const persisted = yield* req.multipart.pipe(
						Effect.mapError(
							(e) =>
								new ImageUploadError({
									message: String(e),
								}),
						),
					);

					const fileField = persisted["file"];
					const fileEntry = Array.isArray(fileField) ? fileField[0] : fileField;

					if (!fileEntry || typeof fileEntry === "string") {
						return yield* Effect.fail(
							new ImageUploadError({
								message: "No file uploaded",
							}),
						);
					}

					const typeField = persisted["type"];
					const type = Array.isArray(typeField)
						? typeField[0]
						: (typeField ?? "image");

					const orderField = persisted["order"];
					const order = Array.isArray(orderField)
						? parseInt(orderField[0] as string)
						: parseInt((orderField as string) ?? "0");

					return yield* listingsService
						.uploadMedia({
							listingId: params.id,
							landlordId: user.userId,
							fileName: (fileEntry as PersistedFile).name,
							filePath: (fileEntry as PersistedFile).path,
							type: type as "image" | "video",
							order: isNaN(order) ? 0 : order,
						})
						.pipe(Effect.catchTag("ImageUploadError", Effect.die));
				}),
			)
			.handle("update", ({ params, payload }) =>
				Effect.gen(function* () {
					const user = yield* CurrentUser;
					return yield* listingsService
						.update(params.id, user.userId, payload)
						.pipe(Effect.catchTag("ListingForbidden", Effect.die));
				}),
			)
			.handle("delete", ({ params }) =>
				Effect.gen(function* () {
					const user = yield* CurrentUser;
					yield* listingsService
						.delete(params.id, user.userId)
						.pipe(Effect.catchTag("ListingNotFound", Effect.die));
				}),
			)
			.handle("myListings", () =>
				Effect.gen(function* () {
					const user = yield* CurrentUser;
					return yield* listingsService
						.getMyListings(user.userId)
						.pipe(Effect.orDie);
				}),
			);
	}),
).pipe(
	Layer.provide(AuthorizationLayer),
	Layer.provide(ListingService.layer),
	Layer.provide(ListingRepository.layer),
	Layer.provide(ImageUploadService.layer),
	Layer.provide(TokenService.layer),
	Layer.provide(AuthConfig.layer),
	Layer.provide(DatabaseLive),
	Layer.provide(BunServices.layer),
);
