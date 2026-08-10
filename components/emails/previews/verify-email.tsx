import type { AppLocale } from "@/i18n/locale-registry";

import { renderEmailPreview } from "../preview-registry";

type Props = { locale?: AppLocale };

export default function VerifyEmailPreview({ locale }: Props) {
  return renderEmailPreview("verify-email", { locale });
}

VerifyEmailPreview.PreviewProps = { locale: "en" } satisfies Props;
