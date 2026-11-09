import type { ReactNode } from "react";

import Image from "next/image";
import { getTranslations } from "next-intl/server";

import { AiClientLogo } from "@/components/ai-connection/ai-client-logo";
import { Google, Instagram, Linkedin, Outlook, Telegram, Whatsapp } from "@/components/icons/channel-icon";
import { MarketingContainer } from "@/components/marketing/marketing-container";

type Item = { group: "agents" | "channels"; icon: ReactNode; name: string };

const ITEMS: Item[] = [
  { group: "channels", icon: <Linkedin className="size-4" size={16} />, name: "LinkedIn" },
  { group: "channels", icon: <Google className="size-4" size={16} />, name: "Gmail" },
  { group: "channels", icon: <Outlook className="size-4" size={16} />, name: "Outlook" },
  { group: "channels", icon: <Whatsapp className="size-4" size={16} />, name: "WhatsApp" },
  { group: "channels", icon: <Instagram className="size-4" size={16} />, name: "Instagram" },
  { group: "channels", icon: <Telegram className="size-4" size={16} />, name: "Telegram" },
  { group: "agents", icon: <AiClientLogo className="size-4" provider="claude" />, name: "Claude" },
  { group: "agents", icon: <AiClientLogo className="size-4" provider="chatgpt" />, name: "ChatGPT" },
  { group: "agents", icon: <AiClientLogo className="size-4" provider="gemini" />, name: "Gemini" },
  { group: "agents", icon: <AiClientLogo className="size-4" provider="cursor" />, name: "Cursor" },
  {
    group: "agents",
    icon: <Image alt="" className="h-4 w-auto" height={16} src="/icons/integrations/n8n.svg" width={31} />,
    name: "n8n",
  },
];

const MIN_CHIPS_PER_TRACK = 14;

function Track({ group, hidden }: { group: Item["group"]; hidden?: boolean }) {
  const items = ITEMS.filter((item) => item.group === group);
  const copies = Array.from({ length: Math.ceil(MIN_CHIPS_PER_TRACK / items.length) }, () => items).flat();

  return (
    <ul aria-hidden={hidden || undefined} className="homepage-marquee-track">
      {copies.map((item, index) => (
        <li key={`${item.name}-${index}`} aria-hidden={index >= items.length || undefined} className="mk-chip">
          {item.icon}

          {item.name}
        </li>
      ))}
    </ul>
  );
}

function Row({ group, label, reverse }: { group: Item["group"]; label: string; reverse?: boolean }) {
  return (
    <div aria-label={label} className="homepage-marquee" data-reverse={reverse || undefined} role="group">
      <Track group={group} />

      <Track hidden group={group} />
    </div>
  );
}

export async function HomepageIntegrations() {
  const t = await getTranslations("HomepageIntegrations");

  return (
    <section aria-label={t("label")} className="w-full" data-homepage-section="integrations">
      <MarketingContainer className="pt-12 pb-2 sm:pt-16">
        <p className="mk-eyebrow text-center">{t("label")}</p>

        <div className="mt-5 grid gap-1">
          <Row group="channels" label={t("channels")} />

          <Row reverse group="agents" label={t("agents")} />
        </div>
      </MarketingContainer>
    </section>
  );
}
