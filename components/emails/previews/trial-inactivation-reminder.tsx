import type { AppLocale } from "@/i18n/locale-registry";

import { renderEmailPreview } from "../preview-registry";

type Props = { locale?: AppLocale };

export default function TrialInactivationReminderPreview({ locale }: Props) {
  return renderEmailPreview("trial-inactivation-reminder", { locale });
}

TrialInactivationReminderPreview.PreviewProps = {
  locale: "en",
} satisfies Props;
