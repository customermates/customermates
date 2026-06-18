import type React from "react";

import { Resend } from "resend";

import { env } from "@/env";

type SendArgs = {
  to: string;
  subject: string;
  react: React.ReactElement<Record<string, unknown>>;
  from?: string;
};

const defaultSender = `Customermates <${env.RESEND_OPERATOR_EMAIL}>`;

export class EmailService {
  async send(args: SendArgs): Promise<void> {
    if (env.NODE_ENV !== "production") {
      console.log("[EmailService] EMAIL (local only)", {
        from: args.from ?? defaultSender,
        to: args.to,
        subject: args.subject,
        props: args.react.props,
      });

      return;
    }

    if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");

    const resend = new Resend(env.RESEND_API_KEY);

    await resend.emails.send({
      from: args.from ?? defaultSender,
      to: args.to,
      subject: args.subject,
      react: args.react,
    });
  }
}
