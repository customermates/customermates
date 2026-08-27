/* eslint-disable @next/next/no-img-element -- review sheets render outside the Next runtime and inline allowlisted assets */

import type { CSSProperties } from "react";

import { AiClientLogo } from "@/components/ai-connection/ai-client-logo";
import { cn } from "@/core/utils/cn";
import type { ContentLocale } from "@/i18n/locale-registry";

import {
  VISUAL_AGENT_PROVIDER_FIXTURES,
  VISUAL_PERSON_FIXTURES,
  VISUAL_PROVIDER_FIXTURES,
  VISUAL_RECORD_FIXTURES,
  VISUAL_STATUS_FIXTURES,
  type VisualAgentProviderFixtureId,
  type VisualPersonFixtureId,
  type VisualProviderFixtureId,
  type VisualRecordFixtureId,
  type VisualStatusFixtureId,
} from "./native-fixtures";

const STATUS_CLASSES: Record<VisualStatusFixtureId, string> = {
  "deal-abandoned": "bg-foreground/5 text-foreground/80",
  "deal-lost": "bg-destructive/20 text-destructive",
  "deal-open": "bg-warning/20 text-warning",
  "deal-won": "bg-success/20 text-success",
};

const STATUS_LABELS: Record<ContentLocale, Record<VisualStatusFixtureId, string>> = {
  de: {
    "deal-abandoned": "Aufgegeben",
    "deal-lost": "Verloren",
    "deal-open": "Offen",
    "deal-won": "Gewonnen",
  },
  en: {
    "deal-abandoned": "Abandoned",
    "deal-lost": "Lost",
    "deal-open": "Open",
    "deal-won": "Won",
  },
};

export function NativeAgentProviderIdentity({
  className,
  iconSize = 20,
  provider,
  style,
  visualSubject,
}: {
  className?: string;
  iconSize?: number;
  provider: VisualAgentProviderFixtureId;
  style?: CSSProperties;
  visualSubject?: string;
}) {
  const fixture = VISUAL_AGENT_PROVIDER_FIXTURES[provider];

  return (
    <span
      className={cn("inline-flex min-w-0 items-center gap-1.5", className)}
      data-native-agent-provider={provider}
      data-visual-subject={visualSubject}
      style={style}
    >
      <span className="grid shrink-0 place-items-center" style={{ height: iconSize, width: iconSize }}>
        <AiClientLogo className="size-full" provider={provider} />
      </span>

      <span className="min-w-0 font-medium">{fixture.name}</span>
    </span>
  );
}

export function ProviderMark({
  className,
  decorative = false,
  provider,
  size = 22,
}: {
  className?: string;
  decorative?: boolean;
  provider: VisualProviderFixtureId;
  size?: number;
}) {
  const fixture = VISUAL_PROVIDER_FIXTURES[provider];

  return (
    <img
      alt={decorative ? "" : fixture.name}
      className={className}
      data-native-provider={provider}
      decoding="async"
      draggable={false}
      height={size}
      src={fixture.asset}
      width={size}
    />
  );
}

export function ProviderIdentity({
  className,
  iconSize = 18,
  provider,
}: {
  className?: string;
  iconSize?: number;
  provider: VisualProviderFixtureId;
}) {
  const fixture = VISUAL_PROVIDER_FIXTURES[provider];

  return (
    <span
      className={cn("inline-flex shrink-0 items-center gap-1.5", className)}
      data-native-provider-identity={provider}
    >
      <ProviderMark decorative provider={provider} size={iconSize} />

      <span className="whitespace-nowrap font-medium">{fixture.name}</span>
    </span>
  );
}

export function PersonAvatar({
  className,
  decorative = false,
  fluid = false,
  person,
  size = 32,
}: {
  className?: string;
  decorative?: boolean;
  fluid?: boolean;
  person: VisualPersonFixtureId;
  size?: number;
}) {
  const fixture = VISUAL_PERSON_FIXTURES[person];

  return (
    <span
      className={cn("relative block shrink-0 overflow-hidden rounded-lg bg-foreground/10", className)}
      data-native-person={person}
      style={fluid ? undefined : { height: size, width: size }}
    >
      <img
        alt={decorative ? "" : fixture.name}
        className="size-full object-cover"
        decoding="async"
        draggable={false}
        height={size}
        src={fixture.asset}
        width={size}
      />
    </span>
  );
}

export function PersonIdentity({
  className,
  person,
  size = 32,
}: {
  className?: string;
  person: VisualPersonFixtureId;
  size?: number;
}) {
  const fixture = VISUAL_PERSON_FIXTURES[person];

  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <PersonAvatar decorative person={person} size={size} />

      <span className="min-w-0 text-xs leading-tight font-medium">{fixture.name}</span>
    </span>
  );
}

export function NativeStatusBadge({
  className,
  locale = "en",
  status,
}: {
  className?: string;
  locale?: ContentLocale;
  status: VisualStatusFixtureId;
}) {
  const fixture = VISUAL_STATUS_FIXTURES[status];

  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-transparent px-2 py-0.5 text-[11px] font-medium",
        STATUS_CLASSES[status],
        className,
      )}
      data-native-status={status}
      data-variant={fixture.variant}
    >
      {STATUS_LABELS[locale][status]}
    </span>
  );
}

export function NativeRecordIdentity({
  locale = "en",
  record,
  statusLabel,
}: {
  locale?: ContentLocale;
  record: VisualRecordFixtureId;
  statusLabel?: string;
}) {
  const fixture = VISUAL_RECORD_FIXTURES[record];

  return (
    <span className="flex min-w-0 flex-col items-start gap-2" data-native-record={record}>
      <span className="text-xs leading-snug font-medium">{fixture.name}</span>

      <span className="flex flex-wrap items-center gap-2">
        {statusLabel ? <span className="text-[10px] text-muted-foreground">{statusLabel}</span> : null}

        <NativeStatusBadge locale={locale} status={fixture.status} />
      </span>
    </span>
  );
}
