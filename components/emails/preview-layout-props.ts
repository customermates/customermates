import type { EmailLayoutSharedProps } from "./base/email-layout";

import { DEFAULT_LOCALE } from "@/i18n/locale-registry";
import { DEFAULT_EMAIL_LAYOUT_COPY } from "./base/email-layout-copy";

export const EMAIL_PREVIEW_LOGO_URL = "/static/customermates-icon.svg";

export const PREVIEW_EMAIL_LAYOUT_PROPS = {
  layoutCopy: DEFAULT_EMAIL_LAYOUT_COPY,
  locale: DEFAULT_LOCALE,
  logoUrl: EMAIL_PREVIEW_LOGO_URL,
} satisfies EmailLayoutSharedProps;
