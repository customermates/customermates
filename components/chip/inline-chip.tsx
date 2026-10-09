"use client";

import type { ComponentProps } from "react";

import { AppChip } from "./app-chip";

export function InlineChip(props: Omit<ComponentProps<typeof AppChip>, "size">) {
  return <AppChip {...props} size="inline" />;
}
