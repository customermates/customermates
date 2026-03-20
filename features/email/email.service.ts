import React from "react";
import { Resend } from "resend";

import { TenantAgnostic } from "@/core/decorators/tenant-agnostic.decorator";
import { IS_DEVELOPMENT, RESEND_FROM_EMAIL } from "@/constants/env";

type SendArgs = {
  to: string;
  subject: string;
  react: React.ReactElement<Record<string, unknown>>;
  from?: string;
};

const defaultSender = `Customermates <${RESEND_FROM_EMAIL}>`;

@TenantAgnostic
export class EmailService {
  async send(args: SendArgs): Promise<void> {
    if (IS_DEVELOPMENT) {
      console.log("[EmailService] EMAIL (local only)", {
        from: args.from ?? defaultSender,
        to: args.to,
        subject: args.subject,
        props: args.react.props,
      });

      return;
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

    const resend = new Resend(apiKey);

    await resend.emails.send({
      from: args.from ?? defaultSender,
      to: args.to,
      subject: args.subject,
      react: args.react,
    });
  }
}
