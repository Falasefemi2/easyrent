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

const escapeHtml = (value: string) =>
	value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");

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
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
</head>
<body
  style="
    margin:0;
    padding:0;
    background:#f4f7fb;
    font-family:Arial, Helvetica, sans-serif;
  "
>
  <table
    width="100%"
    cellpadding="0"
    cellspacing="0"
    style="background:#f4f7fb;padding:40px 20px;"
  >
    <tr>
      <td align="center">

        <table
          width="600"
          cellpadding="0"
          cellspacing="0"
          style="
            background:#ffffff;
            border-radius:16px;
            overflow:hidden;
            box-shadow:0 10px 30px rgba(0,0,0,0.08);
          "
        >

          <!-- Header -->
          <tr>
            <td
              align="center"
              style="
                background:linear-gradient(135deg,#E8442A,#FF6B4A);
                padding:40px 30px;
                color:white;
              "
            >
              <h1
                style="
                  margin:0;
                  font-size:32px;
                  font-weight:700;
                "
              >
                EasyRent
              </h1>

              <p
                style="
                  margin-top:10px;
                  font-size:16px;
                  opacity:0.9;
                "
              >
                Find. Rent. Live.
              </p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:50px 40px;">

              <h2
                style="
                  margin:0 0 20px;
                  color:#222;
                  font-size:28px;
                "
              >
                Welcome, ${escapeHtml(params.fullname)}👋
              </h2>

              <p
                style="
                  color:#555;
                  font-size:16px;
                  line-height:1.7;
                  margin-bottom:24px;
                "
              >
                Thank you for joining EasyRent.
                To complete your registration and secure your account,
                please verify your email address.
              </p>

              <div style="text-align:center;margin:40px 0;">
                <a
                  href="${config.FRONTEND_URL}/verify-email?token=${params.token}"
                  style="
                    background:#E8442A;
                    color:white;
                    text-decoration:none;
                    padding:16px 36px;
                    border-radius:10px;
                    display:inline-block;
                    font-size:16px;
                    font-weight:600;
                  "
                >
                  Verify My Email
                </a>
              </div>

              <div
                style="
                  background:#fff7f5;
                  border-left:4px solid #E8442A;
                  padding:16px;
                  border-radius:8px;
                  margin:30px 0;
                "
              >
                <p
                  style="
                    margin:0;
                    color:#444;
                    font-size:14px;
                    line-height:1.6;
                  "
                >
                  This verification link will expire in
                  <strong>24 hours</strong>.
                </p>
              </div>

              <p
                style="
                  color:#666;
                  font-size:14px;
                  line-height:1.7;
                "
              >
                If the button doesn't work, copy and paste this URL
                into your browser:
              </p>

              <p
                style="
                  word-break:break-all;
                  color:#E8442A;
                  font-size:13px;
                "
              >
                ${config.FRONTEND_URL}/verify-email?token=${params.token}
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td
              style="
                background:#fafafa;
                padding:30px;
                text-align:center;
                border-top:1px solid #eee;
              "
            >
              <p
                style="
                  margin:0;
                  color:#888;
                  font-size:13px;
                "
              >
                If you didn't create an EasyRent account,
                you can safely ignore this email.
              </p>

              <p
                style="
                  margin-top:16px;
                  color:#999;
                  font-size:12px;
                "
              >
                © ${new Date().getFullYear()} EasyRent. All rights reserved.
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</body>
</html>
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
