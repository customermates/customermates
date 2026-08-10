import type { AppLocale } from "@/i18n/locale-registry";

import { renderEmailPreview } from "../preview-registry";

type Props = { locale?: AppLocale };

export default function SubscriptionInactivationNoticePreview({ locale }: Props) {
  return renderEmailPreview("subscription-inactivation-notice", { locale });
}

SubscriptionInactivationNoticePreview.PreviewProps = {
  locale: "en",
} satisfies Props;
