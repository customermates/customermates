import type { ComponentProps, ReactNode, SVGProps } from "react";

import { IconContainer } from "@/components/shared/icon-container";
import { Button } from "@/components/ui/button";
import { cn } from "@/core/utils/cn";

type Props = Omit<ComponentProps<typeof Button>, "children" | "title" | "variant"> & {
  badge?: ReactNode;
  icon?: React.FC<SVGProps<SVGSVGElement>>;
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
      {icon ? <IconContainer className="mb-2 shrink-0" icon={icon} iconClassName="size-5" size="lg" /> : null}

      <span className="flex w-full items-start justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>

        {badge}
      </span>

      <span className="text-xs font-normal leading-relaxed text-muted-foreground">{description}</span>

      {note && noteIcon ? (
        <span className="mt-auto flex items-center gap-1 pt-2 text-xs font-normal text-muted-foreground">
          {noteIcon}

          {note}
        </span>
      ) : note ? (
        <span className="mt-auto pt-2 text-[11px] font-normal leading-relaxed text-muted-foreground">{note}</span>
      ) : null}
    </Button>
  );
}
