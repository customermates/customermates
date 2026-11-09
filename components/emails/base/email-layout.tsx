import type { PropsWithChildren } from "react";
import type { AppLocale } from "@/i18n/locale-registry";
import type { EmailLayoutCopy } from "./email-layout-copy";

import {
  Body,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Row,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";

import { EmailImage } from "./email-image";
import { EMAIL_BRAND, EMAIL_INK, EMAIL_MUTED, EMAIL_RULE } from "./email-tokens";

import { env } from "@/env";
import { colorPalettes } from "@/styles/color-palettes";

const config = {
  theme: {
    extend: {
      colors: {
        ...colorPalettes.light,
        default: { ...colorPalettes.light.default, "700": EMAIL_MUTED, "900": EMAIL_INK },
      },
    },
  },
};

const PRODUCTION_LOGO_URL = `${env.BASE_URL}/images/email/customermates-icon@2x.png`;

export type EmailLayoutSharedProps = {
  logoUrl?: string;
  locale: AppLocale;
  layoutCopy: EmailLayoutCopy;
};

type Props = PropsWithChildren<
  EmailLayoutSharedProps & {
    preview?: string;
    title?: string;
  }
>;

export function EmailLayout({ preview, title, logoUrl = PRODUCTION_LOGO_URL, locale, layoutCopy, children }: Props) {
  const year = new Date().getFullYear();

  return (
    <Html lang={locale}>
      <Tailwind config={config}>
        <Head>
          <style>{`body { font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif; }`}</style>
        </Head>

        {preview ? <Preview>{preview}</Preview> : null}

        <Body style={{ margin: 0, padding: "32px 0", backgroundColor: "#ffffff", color: EMAIL_INK }}>
          <Container style={{ maxWidth: "560px", margin: "0 auto", padding: "0 24px" }}>
            <Section style={{ paddingBottom: "28px" }}>
              <Row>
                <Column style={{ width: "36px", verticalAlign: "middle" }}>
                  <EmailImage alt="" height={28} src={logoUrl} style={{ display: "block" }} width={28} />
                </Column>

                <Column style={{ verticalAlign: "middle" }}>
                  <Text style={{ margin: 0, fontSize: "16px", lineHeight: "24px", fontWeight: 600, color: EMAIL_INK }}>
                    {EMAIL_BRAND}
                  </Text>
                </Column>
              </Row>
            </Section>

            <Section>
              {title ? (
                <Heading
                  as="h1"
                  style={{
                    margin: "0 0 16px",
                    fontSize: "22px",
                    lineHeight: "30px",
                    fontWeight: 600,
                    letterSpacing: "-0.01em",
                    color: EMAIL_INK,
                  }}
                >
                  {title}
                </Heading>
              ) : null}

              {children}
            </Section>

            <Hr style={{ margin: "32px 0 20px", border: "none", borderTop: `1px solid ${EMAIL_RULE}` }} />

            <Section>
              <Text style={{ margin: 0, fontSize: "12px", lineHeight: "18px", color: EMAIL_MUTED }}>
                <span>© {year} Customermates · </span>

                <span>{layoutCopy.tagline}</span>
              </Text>

              {env.NODE_ENV !== "production" || env.APP_MODE !== "self-hosted" ? (
                <Text style={{ margin: "6px 0 0", fontSize: "12px", lineHeight: "18px", color: EMAIL_MUTED }}>
                  <span>Benjamin Wagner · An den Kasernen 25 · 68167 Mannheim, {layoutCopy.country} · </span>

                  <a href="mailto:mail@customermates.com" style={{ color: EMAIL_MUTED, textDecoration: "underline" }}>
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
