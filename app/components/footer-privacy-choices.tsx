"use client";

import { OPEN_PRIVACY_CHOICES_EVENT } from "@/components/acquisition/privacy-choices-event";

type Props = {
  className?: string;
  label: string;
};

export function FooterPrivacyChoices({ className, label }: Props) {
  return (
    <button
      className={className}
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_PRIVACY_CHOICES_EVENT))}
    >
      {label}
    </button>
  );
}
