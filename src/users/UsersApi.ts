import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
import { Authorization } from "../auth/Authorization";
import { ImageUploadError } from "../services/UploadThingService";

const UserSchema = Schema.Struct({
	id: Schema.String,
	email: Schema.String,
	fullname: Schema.String,
	phone: Schema.String,
	avatarUrl: Schema.NullOr(Schema.String),
	createdAt: Schema.Date,
});

export class UsersApiGroup extends HttpApiGroup.make("users")
	.add(
		HttpApiEndpoint.post("uploadAvatar", "/users/avatar", {
			success: Schema.Struct({
				avatarUrl: Schema.String,
			}),
			error: [ImageUploadError],
		}).middleware(Authorization),
	)
	.add(
		HttpApiEndpoint.get("me", "/users/me", {
			success: UserSchema,
		}).middleware(Authorization),
	) {}
