import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/core/utils/cn";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-invalid:ring-inset dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 active:scale-[0.97] motion-reduce:transition-none",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
        secondary: "border border-border bg-secondary text-secondary-foreground shadow-xs hover:bg-accent",
        field:
          "border border-input bg-input-background shadow-xs hover:bg-accent hover:text-accent-foreground aria-[readonly=true]:cursor-default aria-[readonly=true]:border-border aria-[readonly=true]:bg-background aria-[readonly=true]:text-foreground aria-[readonly=true]:shadow-none aria-[readonly=true]:hover:bg-background aria-[readonly=true]:hover:text-foreground aria-[readonly=true]:active:scale-100 data-[field-state=read-only]:cursor-default data-[field-state=read-only]:border-border data-[field-state=read-only]:bg-background data-[field-state=read-only]:text-foreground data-[field-state=read-only]:shadow-none data-[field-state=read-only]:hover:bg-background data-[field-state=read-only]:hover:text-foreground data-[field-state=read-only]:active:scale-100 disabled:border-border disabled:bg-background disabled:text-muted-foreground disabled:shadow-none disabled:opacity-100 disabled:active:scale-100",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        softPrimary: "bg-primary/20 text-primary hover:bg-primary/35",
        softDestructive: "bg-destructive/20 text-destructive hover:bg-destructive/35",
        destructiveOutline:
          "border border-destructive/40 bg-input-background text-destructive shadow-xs hover:bg-destructive/10 hover:border-destructive",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  type,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  const resolvedType = asChild ? type : (type ?? "button");

  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      data-size={size}
      data-slot="button"
      data-variant={variant}
      type={resolvedType}
      {...props}
    />
  );
}

export { Button, buttonVariants };
