// src/services/ImageUploadService.ts
import { Context, Effect, Layer, Schema } from "effect";
import { loadConfig } from "../lib/config";

export class ImageUploadError extends Schema.TaggedErrorClass<ImageUploadError>()(
	"ImageUploadError",
	{ message: Schema.String },
) {}

export class ImageUploadService extends Context.Service<
	ImageUploadService,
	{
		readonly uploadFile: (
			fileName: string,
			filePath: string,
		) => Effect.Effect<string, ImageUploadError>;
	}
>()("easyrent/services/ImageUploadService") {
	static readonly layer = Layer.effect(
		ImageUploadService,
		Effect.gen(function* () {
			const config = yield* loadConfig;

			const uploadFile = Effect.fn("ImageUploadService.uploadFile")(
				(
					fileName: string,
					filePath: string,
				): Effect.Effect<string, ImageUploadError> =>
					Effect.tryPromise({
						try: async () => {
							const fileData = await Bun.file(filePath).arrayBuffer();
							const blob = new Blob([fileData]);

							const formData = new FormData();
							formData.append("file", blob, fileName);
							formData.append("folder", "avatars");
							formData.append("public_id", fileName);
							formData.append("api_key", config.CLOUDINARY_API_KEY);

							const timestamp = Math.round(Date.now() / 1000).toString();
							const paramsToSign = `folder=avatars&public_id=${fileName}&timestamp=${timestamp}`;

							const signature = await crypto.subtle
								.digest(
									"SHA-1",
									new TextEncoder().encode(
										paramsToSign + config.CLOUDINARY_API_SECRET,
									),
								)
								.then((buf) =>
									Array.from(new Uint8Array(buf))
										.map((b) => b.toString(16).padStart(2, "0"))
										.join(""),
								);

							formData.append("timestamp", timestamp);
							formData.append("signature", signature);

							const res = await fetch(
								`https://api.cloudinary.com/v1_1/${config.CLOUDINARY_CLOUD_NAME}/image/upload`,
								{
									method: "POST",
									body: formData,
								},
							);

							const data = (await res.json()) as any;
							if (data.error) throw new Error(data.error.message);
							return data.secure_url as string;
						},
						catch: (e) =>
							new ImageUploadError({
								message: `Upload failed: ${e}`,
							}),
					}),
			);

			return { uploadFile };
		}),
	);
}
