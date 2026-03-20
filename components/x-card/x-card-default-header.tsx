import type { HTMLHeroUIProps } from "@heroui/system";

import { XCardHeader } from "./x-card-header";

type Props = HTMLHeroUIProps<"div"> & {
  title: string;
  subtitle?: string;
  padding?: "none" | "sm" | "md" | "lg";
};

export function XCardDefaultHeader({ title, subtitle, children, ...props }: Props) {
  return (
    <XCardHeader {...props}>
      <div className="flex items-center gap-1 grow min-w-0">
        <h1 className="text-x-lg truncate">{title}</h1>

        {subtitle && <p className="text-x-sm text-subdued">{subtitle}</p>}
      </div>

      {children}
    </XCardHeader>
  );
}
