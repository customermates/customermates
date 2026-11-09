import type { ReactNode } from "react";

import { AlertCircle, CheckCircle2, CircleArrowUp, Info, XCircle } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/core/utils/cn";

const TINTED_ACTIONS =
  "[&_[data-slot=button][data-variant=secondary]]:border-current/30 [&_[data-slot=button][data-variant=secondary]]:bg-transparent [&_[data-slot=button][data-variant=secondary]]:text-inherit [&_[data-slot=button][data-variant=secondary]]:hover:bg-current/10 [&_[data-slot=button][data-variant=secondary]]:focus-visible:ring-current/30";

const alertVariants = cva("relative flex w-full items-start gap-3 border text-sm", {
  variants: {
    variant: {
      neutral: "border-border bg-card text-card-foreground",
      info: "border-border bg-muted/60 text-foreground",
      success: cn("border-success/30 bg-success/8 text-success-soft-foreground", TINTED_ACTIONS),
      warning: cn("border-warning/30 bg-warning/10 text-warning-soft-foreground", TINTED_ACTIONS),
      destructive: cn("border-destructive/30 bg-destructive/8 text-destructive-soft-foreground", TINTED_ACTIONS),
      upsell: "border-border-strong bg-card text-card-foreground",
    },
    layout: {
      inline: "rounded-lg px-4 py-3",
      banner:
        "items-start rounded-none sm:items-center border-x-0 border-t-0 border-border bg-muted/60 px-4 py-2.5 text-foreground",
    },
  },
  defaultVariants: {
    variant: "neutral",
    layout: "inline",
  },
});

export type AlertVariant = NonNullable<VariantProps<typeof alertVariants>["variant"]>;

const DESCRIPTION_TONE: Record<AlertVariant, string> = {
  neutral: "text-muted-foreground",
  info: "text-muted-foreground",
  success: "text-foreground/80",
  warning: "text-foreground/80",
  destructive: "text-foreground/80",
  upsell: "text-muted-foreground",
};

const ICON_TONE: Record<AlertVariant, string> = {
  neutral: "text-muted-foreground",
  info: "text-muted-foreground",
  success: "text-current",
  warning: "text-current",
  destructive: "text-current",
  upsell: "text-foreground",
};

export const ALERT_ICONS = {
  neutral: Info,
  info: Info,
  success: CheckCircle2,
  warning: AlertCircle,
  destructive: XCircle,
  upsell: CircleArrowUp,
} as const;

type Props = Omit<React.ComponentProps<"div">, "title"> &
  VariantProps<typeof alertVariants> & {
    title?: ReactNode;
    description?: ReactNode;
    icon?: ReactNode;
    hideIcon?: boolean;
    action?: ReactNode;
    stacked?: boolean;
  };

export function Alert({
  className,
  variant,
  layout,
  title,
  description,
  icon,
  hideIcon,
  action,
  stacked = false,
  children,
  ...props
}: Props) {
  const tone = variant ?? "neutral";
  const banner = layout === "banner";
  const DefaultIcon = ALERT_ICONS[tone];
  const descriptionTone = banner ? "text-muted-foreground" : DESCRIPTION_TONE[tone];

  return (
    <div
      className={cn(alertVariants({ variant: tone, layout }), className)}
      data-layout={layout ?? "inline"}
      data-slot="alert"
      data-variant={tone}
      role="alert"
      {...props}
    >
      {!hideIcon && (
        <span
          aria-hidden
          className={cn(
            "flex shrink-0 [&>svg]:size-4",
            !banner && "mt-0.5",
            banner && "mt-0.5 sm:mt-0",
            banner && tone !== "warning" && tone !== "destructive" ? "text-muted-foreground" : ICON_TONE[tone],
          )}
          data-slot="alert-icon"
        >
          {icon ?? <DefaultIcon />}
        </span>
      )}

      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col gap-3",
          !stacked && "sm:flex-row sm:items-center sm:justify-between",
        )}
      >
        <div
          className={cn(
            "inline-links flex min-w-0 flex-1 flex-col gap-0.5",
            banner && "sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-2",
          )}
        >
          {title && (
            <div className="leading-5 font-medium tracking-tight" data-slot="alert-title">
              {title}
            </div>
          )}

          {description && (
            <div
              className={cn(
                "grid justify-items-start gap-1 [&_p]:leading-relaxed",
                descriptionTone,
                banner && "text-xs sm:text-sm",
              )}
              data-slot="alert-description"
            >
              <p>{description}</p>
            </div>
          )}

          {children && (
            <div className={cn("min-w-0 [overflow-wrap:anywhere]", descriptionTone)} data-slot="alert-body">
              {children}
            </div>
          )}
        </div>

        {action && (
          <div className="flex shrink-0 flex-wrap items-center gap-2" data-slot="alert-action">
            {action}
          </div>
        )}
      </div>
    </div>
  );
}
