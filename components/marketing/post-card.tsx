import type { ReactNode } from "react";

import { AppLink } from "@/components/shared/app-link";
import { cn } from "@/core/utils/cn";

export type PostCardProps = {
  bottom?: ReactNode;
  description?: string;
  featured?: boolean;
  href: string;
  title: string;
  topLeft?: ReactNode;
  topRight?: ReactNode;
};

export function PostCard({ bottom, description, featured = false, href, title, topLeft, topRight }: PostCardProps) {
  const showMeta = Boolean(topLeft) || Boolean(topRight);

  return (
    <AppLink
      appearance="unstyled"
      className="group block size-full min-w-0 border-t border-border py-6 text-foreground transition-colors hover:border-foreground/50"
      href={href}
    >
      <article className={cn("flex size-full min-w-0 flex-col gap-4", featured && "sm:pr-10")}>
        {showMeta ? (
          <div className="flex min-w-0 items-center justify-between gap-2 text-sm text-subdued">
            {topLeft ?? <span />}

            {topRight ?? null}
          </div>
        ) : null}

        <h3 className={cn("font-semibold leading-tight text-balance", featured ? "text-2xl sm:text-3xl" : "text-lg")}>
          {title}
        </h3>

        {description ? (
          <p className={cn("text-sm leading-6 text-subdued", featured ? "line-clamp-4 sm:text-base" : "line-clamp-3")}>
            {description}
          </p>
        ) : null}

        {bottom ? <div className="mt-auto pt-1">{bottom}</div> : null}
      </article>
    </AppLink>
  );
}
