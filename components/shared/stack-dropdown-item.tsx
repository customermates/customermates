"use client";

import type { ReactNode } from "react";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

type Props = {
  href?: string;
  onActivate: () => void;
  close: () => void;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
};

export function StackDropdownItem({ href, onActivate, close, children, className, ariaLabel }: Props) {
  return (
    <DropdownMenuItem
      aria-label={ariaLabel}
      asChild={Boolean(href)}
      className={className}
      onSelect={(event) => {
        if (href) {
          event.preventDefault();
          return;
        }
        onActivate();
        close();
      }}
    >
      {href ? (
        <a
          href={href}
          onClick={(e) => {
            e.stopPropagation();
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) {
              close();
              return;
            }
            e.preventDefault();
            onActivate();
            close();
          }}
        >
          {children}
        </a>
      ) : (
        children
      )}
    </DropdownMenuItem>
  );
}
