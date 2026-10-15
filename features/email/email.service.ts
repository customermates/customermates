import type React from "react";

import * as Sentry from "@sentry/nextjs";
import { Resend } from "resend";

import { env } from "@/env";

type SendArgs = {
  to: string;
  subject: string;
  react: React.ReactElement<Record<string, unknown>>;
  from?: string;
  deduplicationKey?: string;
};

type SendFailure = { name: string; message: string };

const defaultSender = `Customermates <${env.RESEND_OPERATOR_EMAIL}>`;

export const EMAIL_SEND_TIMEOUT_MS = 10_000;

function log(message: string, details: Record<string, unknown>) {
  console.log(`[EmailService] ${message}`, details);
}

export class EmailService {
  async send(args: SendArgs): Promise<boolean> {
    if (env.NODE_ENV !== "production") {
      log("EMAIL (local only)", {
        from: args.from ?? defaultSender,
        to: args.to,
        subject: args.subject,
        props: args.react.props,
      });

      return true;
    }

    if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");

    const resend = new Resend(env.RESEND_API_KEY);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<{ error: SendFailure }>((resolve) => {
      timer = setTimeout(
        () => resolve({ error: { name: "timeout", message: `no answer within ${EMAIL_SEND_TIMEOUT_MS} ms` } }),
        EMAIL_SEND_TIMEOUT_MS,
      );
    });

    const { error } = await Promise.race([
      resend.emails.send(
        {
          from: args.from ?? defaultSender,
          to: args.to,
          subject: args.subject,
          react: args.react,
        },
        args.deduplicationKey ? { headers: { "Idempotency-Key": args.deduplicationKey } } : undefined,
      ),
      timedOut,
    ]).finally(() => clearTimeout(timer));

    if (error) {
      const recipientDomain = args.to.split("@").at(-1);
      log("Email not sent", {
        subject: args.subject,
        recipientDomain,
        reason: `${error.name}: ${error.message}`,
      });
      Sentry.captureException(new Error(`Resend rejected an email: ${error.name}`), {
        extra: { subject: args.subject, recipientDomain },
      });
      return false;
    }

    return true;
  }
}
