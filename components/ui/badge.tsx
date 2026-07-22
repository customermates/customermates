import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/core/utils/cn";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-md border border-transparent px-2 py-0.5 h-5 text-[11px] font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-invalid:ring-inset dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-primary/20 text-primary [a&]:hover:bg-primary/35",
        secondary:
          "bg-foreground/5 text-foreground/80 dark:bg-foreground/10 [a&]:hover:bg-foreground/10 dark:[a&]:hover:bg-foreground/15",
        destructive: "bg-destructive/20 text-destructive [a&]:hover:bg-destructive/35",
        success: "bg-success/20 text-success [a&]:hover:bg-success/35",
        warning: "bg-warning/20 text-warning [a&]:hover:bg-warning/35",
        info: "bg-info/20 text-info [a&]:hover:bg-info/35",
        outline: "border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        ghost: "[a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        link: "text-primary underline-offset-4 [a&]:hover:underline",
      },
      interactive: {
        true: "cursor-pointer transition-[color,box-shadow,transform] active:scale-[0.97] motion-reduce:transition-none",
        false: "",
      },
    },
    compoundVariants: [
      { variant: "default", interactive: true, class: "hover:bg-primary/35" },
      { variant: "secondary", interactive: true, class: "hover:bg-foreground/10 dark:hover:bg-foreground/15" },
      { variant: "destructive", interactive: true, class: "hover:bg-destructive/35" },
      { variant: "success", interactive: true, class: "hover:bg-success/35" },
      { variant: "warning", interactive: true, class: "hover:bg-warning/35" },
      { variant: "info", interactive: true, class: "hover:bg-info/35" },
      { variant: "outline", interactive: true, class: "hover:bg-accent hover:text-accent-foreground" },
      { variant: "ghost", interactive: true, class: "hover:bg-accent hover:text-accent-foreground" },
      { variant: "link", interactive: true, class: "hover:underline" },
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
