"use client";

import type { ComponentProps } from "react";

import { X } from "lucide-react";

export const AGENT_COMPOSER_CHIP_CLASS =
  "me-1.5 my-px h-5 max-w-full px-[5px] py-0 align-middle text-sm leading-5 font-normal";

type RemoveProps = Omit<ComponentProps<"button">, "children" | "className" | "type" | "onClick" | "onMouseDown"> & {
  label: string;
  onRemove: () => void;
};

export function AgentComposerChipRemove({ label, onRemove, ...props }: RemoveProps) {
  return (
    <button
      {...props}
      aria-label={label}
      className="-mr-0.5 grid size-3.5 shrink-0 place-items-center rounded-sm text-current/60 outline-hidden transition-colors hover:bg-foreground/10 hover:text-current focus-visible:ring-2 focus-visible:ring-ring"
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onRemove();
      }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <X aria-hidden className="size-2.5" />
    </button>
  );
}
