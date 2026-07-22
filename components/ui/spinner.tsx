import * as React from "react";
import { Loader2Icon } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/core/utils/cn";

const spinnerVariants = cva("animate-spin", {
  variants: {
    size: {
      sm: "size-4",
      md: "size-6",
      lg: "size-8",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

function Spinner({ className, size, ...props }: React.ComponentProps<"svg"> & VariantProps<typeof spinnerVariants>) {
  return (
    <Loader2Icon
      aria-label="Loading"
      className={cn(spinnerVariants({ size }), className)}
      data-slot="spinner"
      role="status"
      {...props}
    />
  );
}

export { Spinner, spinnerVariants };
