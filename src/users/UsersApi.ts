import { HttpApiGroup, HttpApiEndpoint } from "effect/unstable/httpapi";
import { Schema } from "effect";
import { Authorization } from "../auth/Authorization";
import { ImageUploadError } from "../services/UploadThingService";

export class UsersApiGroup extends HttpApiGroup.make("users").add(
	HttpApiEndpoint.post("uploadAvatar", "/users/avatar", {
		success: Schema.Struct({
			avatarUrl: Schema.String,
		}),
		error: [ImageUploadError],
	}).middleware(Authorization),
) {}
