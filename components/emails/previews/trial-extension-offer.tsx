import type { AppLocale } from "@/i18n/locale-registry";

import { renderEmailPreview } from "../preview-registry";

type Props = { locale?: AppLocale };

export default function TrialExtensionOfferPreview({ locale }: Props) {
  return renderEmailPreview("trial-extension-offer", { locale });
}

TrialExtensionOfferPreview.PreviewProps = { locale: "en" } satisfies Props;
