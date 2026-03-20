"use client";

import { CheckIcon, MinusIcon, XMarkIcon } from "@heroicons/react/24/outline";

import { XIcon } from "@/components/x-icon";

type Props = {
  label: string;
  status: "available" | "partial" | "unavailable";
};

export function StatusIcon({ label, status }: Props) {
  if (status === "available")
    return <XIcon aria-label={label} className="inline-block align-middle text-success" icon={CheckIcon} size="sm" />;

  if (status === "partial")
    return <XIcon aria-label={label} className="inline-block align-middle text-default" icon={MinusIcon} size="sm" />;

  return <XIcon aria-label={label} className="inline-block align-middle text-danger" icon={XMarkIcon} size="sm" />;
}

export function StatusAvailable() {
  return <StatusIcon label="Available" status="available" />;
}

export function StatusPartial() {
  return <StatusIcon label="Partial" status="partial" />;
}

export function StatusUnavailable() {
  return <StatusIcon label="Unavailable" status="unavailable" />;
}
