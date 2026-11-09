import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/core/utils/cn";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-md border border-transparent px-2 py-0.5 h-5 text-[11px] font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-invalid:ring-inset dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-primary/10 text-primary-soft-foreground [a&]:hover:bg-primary/15",
        ink: "bg-primary/10 text-primary-soft-foreground [a&]:hover:bg-primary/15",
        blue: "bg-chip-blue/15 text-chip-blue-foreground [a&]:hover:bg-chip-blue/25",
        secondary: "bg-foreground/5 text-foreground/80 [a&]:hover:bg-foreground/10",
        destructive: "bg-destructive/12 text-destructive-soft-foreground [a&]:hover:bg-destructive/20",
        success: "bg-success/12 text-success-soft-foreground [a&]:hover:bg-success/20",
        warning: "bg-warning/12 text-warning-soft-foreground [a&]:hover:bg-warning/20",
        info: "bg-info/12 text-info-soft-foreground [a&]:hover:bg-info/20",
        outline: "border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        ghost: "[a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        link: "text-primary underline decoration-primary/30 underline-offset-4 [a&]:hover:decoration-primary",
      },
      interactive: {
        true: "cursor-pointer transition-[color,box-shadow,transform] active:scale-[0.97] motion-reduce:transition-none",
        false: "",
      },
    },
    compoundVariants: [
      { variant: "default", interactive: true, class: "hover:bg-primary/15" },
      { variant: "ink", interactive: true, class: "hover:bg-primary/15" },
      { variant: "blue", interactive: true, class: "hover:bg-chip-blue/25" },
      { variant: "secondary", interactive: true, class: "hover:bg-foreground/10" },
      { variant: "destructive", interactive: true, class: "hover:bg-destructive/20" },
      { variant: "success", interactive: true, class: "hover:bg-success/20" },
      { variant: "warning", interactive: true, class: "hover:bg-warning/20" },
      { variant: "info", interactive: true, class: "hover:bg-info/20" },
      { variant: "outline", interactive: true, class: "hover:bg-accent hover:text-accent-foreground" },
      { variant: "ghost", interactive: true, class: "hover:bg-accent hover:text-accent-foreground" },
      { variant: "link", interactive: true, class: "hover:decoration-primary" },
    ],
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant = "default",
  interactive,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";

  return (
    <Comp
      className={cn(badgeVariants({ variant, interactive }), className)}
      data-slot="badge"
      data-variant={variant}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
