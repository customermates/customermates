"use client";

import type { ReactNode } from "react";
import type { PublicSignupSpot } from "@/core/utils/public-signup";

import Image from "next/image";

import { cn } from "@/core/utils/cn";
import { publicSignupHref } from "@/core/utils/public-signup";

type Props = {
  id: string;
  label: string;
  spot: PublicSignupSpot;
  className?: string;
  target?: "_top";
  children?: ReactNode;
};

export function MadeWithBadge({ id, label, spot, className, target, children }: Props) {
  return (
    <a
      className={cn(
        "group flex w-fit items-center gap-2 rounded-full border border-border bg-card/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:text-foreground",
        className,
      )}
      href={publicSignupHref(spot)}
      id={id}
      rel={target ? "noopener" : undefined}
      target={target}
    >
      <Image
        alt=""
        className="size-4 rounded dark:hidden"
        height={16}
        src="/images/light/customermates-square.svg"
        width={16}
      />

      <Image
        alt=""
        className="hidden size-4 rounded dark:block"
        height={16}
        src="/images/dark/customermates-square.svg"
        width={16}
      />

      <span>{label}</span>

      {children}
    </a>
  );
}
