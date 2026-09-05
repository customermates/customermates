import type { ReactNode } from "react";

import { Loader2 } from "lucide-react";

import { AppImage } from "@/components/shared/app-image";

import { AppCardHeader } from "./app-card-header";

type Props = {
  alt?: string;
  subtitle?: ReactNode;
  title: string;
  isLoading?: boolean;
};

export function CardHeroHeader({ alt, subtitle, title, isLoading }: Props) {
  return (
    <AppCardHeader className="text-center flex-col gap-2">
      {isLoading ? (
        <Loader2 className="size-8 animate-spin" />
      ) : (
        <AppImage
          alt={alt ?? title}
          className="inline-block rounded-lg object-contain select-none shadow-[0_0_10px_0] shadow-primary/10 dark:shadow-primary/20"
          height={48}
          loading="eager"
          src="customermates-square.svg"
          width={48}
        />
      )}

      <h1 className="text-x-2xl mt-4">{title}</h1>

      {subtitle && (
        <span className="text-x-sm text-subdued min-w-0 max-w-full [overflow-wrap:anywhere]">{subtitle}</span>
      )}
    </AppCardHeader>
  );
}
