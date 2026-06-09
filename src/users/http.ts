import { Effect, Layer, Option } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { HttpServerRequest } from "effect/unstable/http";
import { CurrentUser } from "../auth/Authorization";
import { UsersRepository } from "./UsersRepository";
import { AuthorizationLayer } from "../auth/Authorization";
import { TokenService } from "../auth/TokenService";
import { AuthConfig } from "../auth/AuthConfig";
import { DatabaseLive } from "../db";
import { Api } from "../auth/Api";
import {
	ImageUploadError,
	ImageUploadService,
} from "../services/UploadThingService";
import { BunServices } from "@effect/platform-bun";

export const UsersApiHandlers = HttpApiBuilder.group(
	Api,
	"users",
	Effect.fn(function* (handlers) {
		return handlers
			.handle("uploadAvatar", () =>
				Effect.gen(function* () {
					const user = yield* CurrentUser;
					const imageUpload = yield* ImageUploadService;
					const usersRepo = yield* UsersRepository;
					const req = yield* HttpServerRequest.HttpServerRequest;

					const persisted = yield* req.multipart.pipe(
						Effect.mapError(
							(e) => new ImageUploadError({ message: String(e) }),
						),
					);

					const fileField = persisted["file"];
					const fileEntry = Array.isArray(fileField) ? fileField[0] : fileField;

					if (!fileEntry || typeof fileEntry === "string") {
						return yield* new ImageUploadError({ message: "No file uploaded" });
					}

					const avatarUrl = yield* imageUpload.uploadFile(
						fileEntry.name,
						fileEntry.path,
					);

					yield* usersRepo
						.updateAvatar(user.userId, avatarUrl)
						.pipe(Effect.orDie);

					return { avatarUrl };
				}),
			)
			.handle("me", () =>
				Effect.gen(function* () {
					const user = yield* CurrentUser;
					const usersRepo = yield* UsersRepository;

					const maybeUser = yield* usersRepo
						.findById(user.userId)
						.pipe(Effect.orDie);

					return yield* Option.match(maybeUser, {
						onNone: () => Effect.die("User not found"),
						onSome: (u) =>
							Effect.succeed({
								id: u.id,
								email: u.email,
								fullname: u.fullname,
								phone: u.phone,
								avatarUrl: u.avatarUrl ?? null,
								createdAt: u.createdAt,
							}),
					});
				}),
			);
	}),
).pipe(
	Layer.provide(AuthorizationLayer),
	Layer.provide(ImageUploadService.layer),
	Layer.provide(UsersRepository.layer),
	Layer.provide(TokenService.layer),
	Layer.provide(AuthConfig.layer),
	Layer.provide(DatabaseLive),
	Layer.provide(BunServices.layer),
);
