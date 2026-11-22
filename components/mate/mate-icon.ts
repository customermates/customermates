import type { LucideIcon, LucideProps } from "lucide-react";

import { createElement, forwardRef } from "react";

import { MateOrb } from "./mate-orb";

export const MateIcon: LucideIcon = forwardRef<SVGSVGElement, LucideProps>(function MateIcon({ className }, _ref) {
  return createElement(MateOrb, { className });
});
