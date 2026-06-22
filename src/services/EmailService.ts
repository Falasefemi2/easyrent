import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { loadConfig } from "../lib/config";
import { BrevoClient } from "@getbrevo/brevo";

export class EmailError extends Schema.TaggedErrorClass<EmailError>()(
	"EmailError",
	{
		message: Schema.String,
	},
) {}

export class EmailService extends Context.Service<
	EmailService,
	{
		readonly sendVerificationEmail: (params: {
			to: string;
			fullname: string;
			token: string;
		}) => Effect.Effect<void, EmailError>;
	}
>()("easyrent/services/EmailService") {
	static readonly layer = Layer.effect(
		EmailService,
		Effect.gen(function* () {
			const config = yield* loadConfig;
			const brevo = new BrevoClient({ apiKey: config.BREVO_API_KEY });

			const sendVerificationEmail = Effect.fn(
				"EmailService.sendVerificationEmail",
			)(
				(params: {
					to: string;
					fullname: string;
					token: string;
				}): Effect.Effect<void, EmailError> =>
					Effect.tryPromise({
						try: () =>
							brevo.transactionalEmails //
								.sendTransacEmail({
									sender: { email: config.FROM_EMAIL, name: "EasyRent" },
									to: [{ email: params.to }],
									subject: "Verify your EasyRent email",
									htmlContent: `
                  <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
                    <h2 style="color: #E8442A;">Welcome to EasyRent, ${params.fullname}!</h2>
                    <p>Click the button below to verify your email address.</p>
                    <a href="${config.FRONTEND_URL}/verify-email?token=${params.token}"
                       style="display: inline-block; background: #E8442A; color: white;
                              padding: 12px 24px; border-radius: 8px; text-decoration: none;
                              font-weight: 500; margin: 16px 0;">
                      Verify Email
                    </a>
                    <p style="color: #666; font-size: 14px;">
                      This link expires in 24 hours. If you didn't create an account, ignore this email.
                    </p>
                  </div>
                `,
								})
								.then(() => void 0),
						catch: (e) =>
							new EmailError({ message: `Failed to send email: ${e}` }),
					}),
			);

			return { sendVerificationEmail };
		}),
	);
}
