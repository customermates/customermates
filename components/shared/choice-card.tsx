import type { ComponentProps, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/core/utils/cn";

type Props = Omit<ComponentProps<typeof Button>, "children" | "title" | "variant"> & {
  badge?: ReactNode;
  description: string;
  note?: string;
  title: string;
};

export function ChoiceCard({ badge, className, description, note, title, type = "button", ...props }: Props) {
  return (
    <Button
      className={cn(
        "relative h-auto min-h-36 w-full flex-col items-start justify-start whitespace-normal rounded-xl p-4 text-left",
        className,
      )}
      type={type}
      variant="secondary"
      {...props}
    >
      <span className="flex w-full items-start justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>

        {badge}
      </span>

      <span className="text-xs font-normal leading-relaxed text-muted-foreground">{description}</span>

      {note ? (
        <span className="mt-auto pt-2 text-[11px] font-normal leading-relaxed text-muted-foreground">{note}</span>
      ) : null}
    </Button>
  );
}
