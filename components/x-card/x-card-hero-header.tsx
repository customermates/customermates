import type { ReactNode } from "react";

import { Spinner } from "@heroui/spinner";

import { XImage } from "../x-image";

import { XCardHeader } from "./x-card-header";

type Props = {
  alt?: string;
  subtitle?: ReactNode;
  title: string;
  isLoading?: boolean;
};

export function XCardHeroHeader({ alt, subtitle, title, isLoading }: Props) {
  return (
    <XCardHeader className="text-center flex-col gap-2">
      {isLoading ? (
        <Spinner color="default" size="lg" />
      ) : (
        <XImage
          alt={alt ?? title}
          className="inline-block object-contain select-none"
          height={48}
          loading="eager"
          src="customermates-square.svg"
          width={48}
        />
      )}

      <h1 className="text-x-2xl mt-4">{title}</h1>

      {subtitle && <span className="text-x-sm text-subdued">{subtitle}</span>}
    </XCardHeader>
  );
}
