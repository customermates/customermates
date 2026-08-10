import type { AppLocale } from "@/i18n/locale-registry";

import { renderEmailPreview } from "../preview-registry";

type Props = { locale?: AppLocale };

export default function LegalDocumentNoticeContractPreview({ locale }: Props) {
  return renderEmailPreview("legal-document-notice", {
    locale,
    variant: "contract",
  });
}

LegalDocumentNoticeContractPreview.PreviewProps = {
  locale: "en",
} satisfies Props;
