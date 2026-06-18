import type { PropsWithChildren } from "react";

import { Body, Container, Head, Heading, Html, Preview, Section, Tailwind, Text } from "@react-email/components";

import { EmailImage } from "./email-image";

import { env } from "@/env";
import { colorPalettes } from "@/styles/color-palettes";

const config = {
  theme: {
    extend: {
      colors: {
        ...colorPalettes.light,
      },
    },
  },
};

const ICON_URL = `${env.BASE_URL}/images/email/customermates-icon@2x.png`;

type Props = PropsWithChildren<{
  preview?: string;
  title?: string;
}>;

export function EmailLayout({ preview, title, children }: Props) {
  const year = new Date().getFullYear();

  return (
    <Html>
      <Tailwind config={config}>
        <Head>
          <style>{`body { font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif; }`}</style>
        </Head>

        {preview ? <Preview>{preview}</Preview> : null}

        <Body className="m-0 py-8 font-sans bg-content2">
          <Container className="mx-auto max-w-[600px] px-4">
            <Section className="pb-6">
              <EmailImage alt="Customermates" height={56} src={ICON_URL} style={{ margin: "0 auto" }} width={56} />
            </Section>

            <Section className="bg-content1 rounded-xl p-10">
              {title ? (
                <Heading className="text-2xl font-semibold tracking-tight text-default-900 mt-0 mb-4">{title}</Heading>
              ) : null}

              {children}
            </Section>

            <Section className="pt-6 text-center">
              <Text className="m-0 text-xs text-default-700">
                © {year} Customermates · The agentic, open-source CRM
              </Text>

              {env.NODE_ENV !== "production" || env.CLOUD_HOSTED ? (
                <Text className="mt-2 text-xs text-default-700">
                  <span>Benjamin Wagner · An den Kasernen 25 · 68167 Mannheim, Germany · </span>

                  <a className="text-default-700 underline" href="mailto:mail@customermates.com">
                    mail@customermates.com
                  </a>
                </Text>
              ) : null}
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
