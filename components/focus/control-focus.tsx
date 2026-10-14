"use client";

import { Suspense } from "react";

import type { FocusKind } from "./focus-href";

import { useFocusTarget } from "./focus-target";

const CONTROL_FOCUS_KINDS: FocusKind[] = ["control"];

function ControlFocusReader() {
  useFocusTarget(CONTROL_FOCUS_KINDS, () => true);
  return null;
}

export function ControlFocus() {
  return (
    <Suspense fallback={null}>
      <ControlFocusReader />
    </Suspense>
  );
}
