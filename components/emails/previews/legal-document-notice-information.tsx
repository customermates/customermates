import type { AppLocale } from "@/i18n/locale-registry";

import { renderEmailPreview } from "../preview-registry";

type Props = { locale?: AppLocale };

export default function LegalDocumentNoticeInformationPreview({ locale }: Props) {
  return renderEmailPreview("legal-document-notice", {
    locale,
    variant: "information",
  });
}

LegalDocumentNoticeInformationPreview.PreviewProps = {
  locale: "en",
} satisfies Props;
