import type { AppLocale } from "@/i18n/locale-registry";

import { renderEmailPreview } from "../preview-registry";

type Props = { locale?: AppLocale };

export default function TrialInactivationNoticePreview({ locale }: Props) {
  return renderEmailPreview("trial-inactivation-notice", { locale });
}

TrialInactivationNoticePreview.PreviewProps = { locale: "en" } satisfies Props;
