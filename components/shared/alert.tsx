import { AlertCircle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";

import { Alert as UiAlert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

const alertColorVariants = cva("[&_a]:text-inherit [&_a]:underline", {
  variants: {
    color: {
      default: "",
      success:
        "border-success/30 bg-success/10 text-success [&>svg]:text-success *:data-[slot=alert-description]:text-success/90",
      warning:
        "border-warning/30 bg-warning/10 text-warning [&>svg]:text-warning *:data-[slot=alert-description]:text-warning/90",
      danger:
        "border-destructive/30 bg-destructive/10 text-destructive [&>svg]:text-destructive *:data-[slot=alert-description]:text-destructive/90",
      primary:
        "border-primary/30 bg-primary/10 text-primary [&>svg]:text-primary *:data-[slot=alert-description]:text-primary/90",
    },
  },
  defaultVariants: {
    color: "default",
  },
});

const iconByColor = {
  default: Info,
  success: CheckCircle2,
  warning: AlertCircle,
  danger: XCircle,
  primary: Info,
} as const;

type Props = React.ComponentProps<"div"> &
  VariantProps<typeof alertColorVariants> & {
    title?: React.ReactNode;
    description?: React.ReactNode;
    icon?: React.ReactNode;
    hideIcon?: boolean;
  };

export function Alert({ className, color = "default", title, description, icon, hideIcon, children, ...props }: Props) {
  const resolvedColor = color ?? "default";
  const DefaultIcon = iconByColor[resolvedColor];

  return (
    <UiAlert className={cn(alertColorVariants({ color: resolvedColor }), className)} {...props}>
      {!hideIcon && (icon ?? <DefaultIcon />)}

      {title && <AlertTitle>{title}</AlertTitle>}

      {description && <AlertDescription>{description}</AlertDescription>}

      {children && <div className="col-start-2 min-w-0">{children}</div>}
    </UiAlert>
  );
}
