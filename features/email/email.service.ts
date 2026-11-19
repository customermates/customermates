import type React from "react";

import * as ErrorReporter from "@/core/observability/server";
import { Resend } from "resend";

import { env } from "@/env";

type SendArgs = {
  to: string;
  subject: string;
  react: React.ReactElement<Record<string, unknown>>;
  from?: string;
  replyTo?: string;
  deduplicationKey?: string;
};

type SendFailure = { name: string; message: string };

const defaultSender = `Customermates <${env.RESEND_OPERATOR_EMAIL}>`;

const SENDER_NAME_MAX_CHARS = 120;

export function senderNamed(displayName: string): string {
  const name = displayName
    .replace(/[\p{Cc}"\\<>]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, SENDER_NAME_MAX_CHARS)
    .trim();

  return name ? `"${name}" <${env.RESEND_OPERATOR_EMAIL}>` : defaultSender;
}

export const EMAIL_SEND_TIMEOUT_MS = 10_000;

function log(message: string, details: Record<string, unknown>) {
  console.log(`[EmailService] ${message}`, details);
}

export class EmailService {
  isConfigured(): boolean {
    return env.NODE_ENV !== "production" || Boolean(env.RESEND_API_KEY);
  }

  async send(args: SendArgs): Promise<boolean> {
    if (env.NODE_ENV !== "production") {
      log("EMAIL (local only)", {
        from: args.from ?? defaultSender,
        to: args.to,
        subject: args.subject,
        ...(args.replyTo ? { replyTo: args.replyTo } : {}),
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
          ...(args.replyTo ? { replyTo: args.replyTo } : {}),
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
      ErrorReporter.captureException(new Error(`Resend rejected an email: ${error.name}`), {
        extra: { subject: args.subject, recipientDomain },
      });
      return false;
    }

    return true;
  }
}
