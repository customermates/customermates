import type { AppLocale } from "@/i18n/locale-registry";

import { renderEmailPreview } from "../preview-registry";

type Props = { locale?: AppLocale };

export default function CompanyInvitePreview({ locale }: Props) {
  return renderEmailPreview("company-invite", { locale });
}

CompanyInvitePreview.PreviewProps = { locale: "en" } satisfies Props;
