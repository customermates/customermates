import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { FeatureIcon } from "@/components/shared/feature-icon";
import { ICONS } from "@/components/shared/icons";
import { cn } from "@/core/utils/cn";

export const FEATURE_POINT_ICONS = {
  BarChart3: ICONS.BarChart3,
  Briefcase: ICONS.Briefcase,
  Building2: ICONS.Building2,
  Code2: ICONS.Code2,
  DollarSign: ICONS.DollarSign,
  Inbox: ICONS.Inbox,
  Mail: ICONS.Mail,
  MessageCircle: ICONS.MessageCircle,
  Server: ICONS.Server,
  Share2: ICONS.Share2,
  ShieldCheck: ICONS.ShieldCheck,
  Sparkles: ICONS.Sparkles,
  TrendingUp: ICONS.TrendingUp,
  Users: ICONS.Users,
  Zap: ICONS.Zap,
} as const;

export type FeaturePointIconName = keyof typeof FEATURE_POINT_ICONS;

export function FeaturePoints({ children, className, ...props }: ComponentPropsWithoutRef<"ul">) {
  return (
    <ul
      {...props}
      className={cn("not-prose my-10 grid list-none gap-4 p-0 sm:grid-cols-2", className)}
      data-feature-points="true"
    >
      {children}
    </ul>
  );
}

export function FeaturePoint({
  children,
  className,
  icon,
  title,
  ...props
}: Omit<ComponentPropsWithoutRef<"li">, "title"> & {
  children: ReactNode;
  icon: FeaturePointIconName;
  title: string;
}) {
  const Icon = FEATURE_POINT_ICONS[icon];
  if (!Icon) throw new Error(`Unsupported feature-point icon: ${icon}`);

  return (
    <li {...props} className={cn("list-none", className)} data-feature-point="true">
      <article className="flex h-full flex-col rounded-card border border-border bg-card p-6 text-card-foreground">
        <FeatureIcon icon={Icon} />

        <h3 className="m-0 mt-6 text-lg leading-snug font-medium tracking-tight">{title}</h3>

        <div
          className={cn(
            "mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground",
            "[&_a]:text-primary [&_a]:no-underline hover:[&_a]:underline",
            "[&_p]:m-0 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-muted-foreground",
            "[&_strong]:font-medium [&_strong]:text-foreground",
          )}
        >
          {children}
        </div>
      </article>
    </li>
  );
}
