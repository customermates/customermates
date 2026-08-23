import { cn } from "@/core/utils/cn";

export const ILLUSTRATION_VIEWBOX = "0 0 640 360";

export const ILLUSTRATION_INK = "var(--foreground)";

export const ILLUSTRATION_OPACITY = {
  body: 0.07,
  detail: 0.16,
} as const;

export type IllustrationProps = {
  className?: string;
  label?: string;
};

export function illustrationSvgProps({ className, label }: IllustrationProps) {
  return {
    "aria-hidden": label ? undefined : true,
    "aria-label": label,
    className: cn("block h-auto w-full", className),
    role: label ? ("img" as const) : undefined,
    viewBox: ILLUSTRATION_VIEWBOX,
    xmlns: "http://www.w3.org/2000/svg",
  };
}
