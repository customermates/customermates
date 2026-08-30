import type { Hero } from "@/core/fumadocs/schemas/automation";

import { PageHero } from "@/components/marketing/page-hero";

type Props = Hero;

export function AutomationHero({
  buttonLeftHref,
  buttonLeftText,
  buttonRightHref,
  buttonRightText,
  startFree,
  subtitle,
  title,
  titleAccent,
}: Props) {
  return (
    <PageHero
      buttonLeftHref={buttonLeftHref}
      buttonLeftText={buttonLeftText}
      buttonRightHref={buttonRightHref}
      buttonRightText={buttonRightText}
      description={subtitle}
      hint={startFree}
      title={title}
      titleAccent={titleAccent}
    />
  );
}
