"use client";

import { useEffect } from "react";

import { withCampaignParams } from "@/features/acquisition/campaign-link";

const CARRY_EVENTS = ["click", "auxclick", "keydown", "contextmenu"] as const;

export function CampaignLinkCarrier({ signupOrigins }: { signupOrigins?: readonly string[] }) {
  useEffect(() => {
    if (!window.location.search.includes("utm_")) return;

    function carry(event: Event) {
      if (event instanceof KeyboardEvent && event.key !== "Enter") return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const next = withCampaignParams(anchor.href, window.location.href, { signupOrigins });
      if (next !== anchor.href) anchor.href = next;
    }

    for (const type of CARRY_EVENTS) document.addEventListener(type, carry, true);

    return () => {
      for (const type of CARRY_EVENTS) document.removeEventListener(type, carry, true);
    };
  }, [signupOrigins]);

  return null;
}
