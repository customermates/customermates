/* eslint-disable @next/next/no-img-element -- review sheets render outside the Next runtime and inline allowlisted assets */

import type { CSSProperties } from "react";

import { AiClientLogo } from "@/components/ai-connection/ai-client-logo";
import { cn } from "@/core/utils/cn";

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

export function NativeAgentProviderIdentity({
  className,
  iconSize = 20,
  motionSubject,
  provider,
  style,
}: {
  className?: string;
  iconSize?: number;
  motionSubject?: string;
  provider: VisualAgentProviderFixtureId;
  style?: CSSProperties;
}) {
  const fixture = VISUAL_AGENT_PROVIDER_FIXTURES[provider];

  return (
    <span
      className={cn("inline-flex min-w-0 items-center gap-1.5", className)}
      data-motion-subject={motionSubject}
      data-native-agent-provider={provider}
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
  provider,
  size = 22,
}: {
  className?: string;
  provider: VisualProviderFixtureId;
  size?: number;
}) {
  const fixture = VISUAL_PROVIDER_FIXTURES[provider];

  return (
    <img
      alt={fixture.name}
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

export function PersonAvatar({
  className,
  fluid = false,
  person,
  size = 32,
}: {
  className?: string;
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
        alt={fixture.name}
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
      <PersonAvatar person={person} size={size} />

      <span className="min-w-0 text-xs leading-tight font-medium">{fixture.name}</span>
    </span>
  );
}

export function NativeStatusBadge({ className, status }: { className?: string; status: VisualStatusFixtureId }) {
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
      {fixture.label}
    </span>
  );
}

export function NativeRecordIdentity({ record }: { record: VisualRecordFixtureId }) {
  const fixture = VISUAL_RECORD_FIXTURES[record];

  return (
    <span className="flex min-w-0 flex-col items-start gap-2" data-native-record={record}>
      <span className="text-xs leading-snug font-medium">{fixture.name}</span>

      <NativeStatusBadge status={fixture.status} />
    </span>
  );
}
