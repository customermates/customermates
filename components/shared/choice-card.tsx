import type { ComponentProps, ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/core/utils/cn";

type Props = Omit<ComponentProps<typeof Button>, "children" | "title" | "variant"> & {
  badge?: ReactNode;
  icon?: ReactNode;
  noteIcon?: ReactNode;
  description: string;
  note?: string;
  title: string;
};

export function ChoiceCard({
  badge,
  className,
  description,
  icon,
  note,
  noteIcon,
  title,
  type = "button",
  ...props
}: Props) {
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
      {icon ? (
        <span
          aria-hidden="true"
          className="mb-2 grid size-11 shrink-0 place-items-center rounded-xl border border-border bg-card text-foreground shadow-xs [&_svg]:size-5"
        >
          {icon}
        </span>
      ) : null}

      <span className="flex w-full items-start justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>

        {badge}
      </span>

      <span className="text-xs font-normal leading-relaxed text-muted-foreground">{description}</span>

      {note && noteIcon ? (
        <span className="mt-auto pt-2">
          <Badge className="gap-1.5 font-normal" variant="secondary">
            {noteIcon}

            {note}
          </Badge>
        </span>
      ) : note ? (
        <span className="mt-auto pt-2 text-[11px] font-normal leading-relaxed text-muted-foreground">{note}</span>
      ) : null}
    </Button>
  );
}
