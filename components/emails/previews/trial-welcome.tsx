import type { AppLocale } from "@/i18n/locale-registry";

import { renderEmailPreview } from "../preview-registry";

type Props = { locale?: AppLocale };

export default function TrialWelcomePreview({ locale }: Props) {
  return renderEmailPreview("trial-welcome", { locale });
}

TrialWelcomePreview.PreviewProps = { locale: "en" } satisfies Props;
