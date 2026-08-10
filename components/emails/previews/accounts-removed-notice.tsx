import type { AppLocale } from "@/i18n/locale-registry";

import { renderEmailPreview } from "../preview-registry";

type Props = { locale?: AppLocale };

export default function AccountsRemovedNoticePreview({ locale }: Props) {
  return renderEmailPreview("accounts-removed-notice", { locale });
}

AccountsRemovedNoticePreview.PreviewProps = { locale: "en" } satisfies Props;
