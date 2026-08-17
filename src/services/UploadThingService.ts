// src/services/ImageUploadService.ts
import { Context, Effect, Layer, Schema } from "effect"
import { loadConfig } from "../lib/config"
import { withExternalSpan } from "./TracerService"

export class ImageUploadError extends Schema.TaggedError<ImageUploadError>()("ImageUploadError", {
  message: Schema.String,
}) {}

const CloudinaryUploadResponse = Schema.Struct({
  secure_url: Schema.optional(Schema.String),
  error: Schema.optional(
    Schema.Struct({
      message: Schema.String,
    }),
  ),
})

export class ImageUploadService extends Context.Service<
  ImageUploadService,
  {
    readonly uploadFile: (fileName: string, filePath: string) => Effect.Effect<string, ImageUploadError>
  }
>()("easyrent/services/ImageUploadService") {
  static readonly layer = Layer.effect(
    ImageUploadService,
    Effect.gen(function* () {
      const config = yield* loadConfig

      const uploadFile = Effect.fn("ImageUploadService.uploadFile")(
        (fileName: string, filePath: string): Effect.Effect<string, ImageUploadError> =>
          withExternalSpan(
            "ImageUploadService.uploadFile.cloudinary",
            Effect.tryPromise({
              try: async () => {
                const fileData = await Bun.file(filePath).arrayBuffer()
                const blob = new Blob([fileData])

                const formData = new FormData()
                formData.append("file", blob, fileName)
                formData.append("folder", "avatars")
                formData.append("public_id", fileName)
                formData.append("api_key", config.CLOUDINARY_API_KEY)

                const timestamp = Math.round(Date.now() / 1000).toString()
                const paramsToSign = `folder=avatars&public_id=${fileName}&timestamp=${timestamp}`

                const signature = await crypto.subtle
                  .digest("SHA-1", new TextEncoder().encode(paramsToSign + config.CLOUDINARY_API_SECRET))
                  .then((buf) =>
                    Array.from(new Uint8Array(buf))
                      .map((b) => b.toString(16).padStart(2, "0"))
                      .join(""),
                  )

                formData.append("timestamp", timestamp)
                formData.append("signature", signature)

                const res = await fetch(
                  `https://api.cloudinary.com/v1_1/${config.CLOUDINARY_CLOUD_NAME}/image/upload`,
                  {
                    method: "POST",
                    body: formData,
                  },
                )

                const data = Schema.decodeUnknownSync(CloudinaryUploadResponse)(await res.json())
                if (data.error) throw new Error(data.error.message)
                if (!data.secure_url) throw new Error("Cloudinary did not return a secure_url")
                return data.secure_url
              },
              catch: (e) =>
                new ImageUploadError({
                  message: `Upload failed: ${e}`,
                }),
            }),
          ),
      )

      return { uploadFile }
    }),
  )
}
