import type { AppLocale } from "@/i18n/locale-registry";

import { renderEmailPreview } from "../preview-registry";

type Props = { locale?: AppLocale };

export default function ResetPasswordPreview({ locale }: Props) {
  return renderEmailPreview("reset-password", { locale });
}

ResetPasswordPreview.PreviewProps = { locale: "en" } satisfies Props;
