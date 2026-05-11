"use client";

import { useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useNavigateToHref } from "@/components/modal/hooks/use-entity-drawer-stack";
import { cn } from "@/lib/utils";

type AvatarStackItem = {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null | undefined;
  email?: string | null | undefined;
};

type Props<T extends AvatarStackItem> = {
  items: T[];
  maxVisible?: number;
  size?: "sm" | "default" | "lg";
  className?: string;
  onAvatarClick?: (item: T) => void;
  avatarHref?: (item: T) => string | undefined;
};

function getInitials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.trim().toUpperCase();
}

export function AvatarStack<T extends AvatarStackItem>({
  items,
  maxVisible = 3,
  size = "default",
  className = "",
  onAvatarClick,
  avatarHref,
}: Props<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const navigateToHref = useNavigateToHref();

  if (!items?.length) return null;

  const visibleItems = items.slice(0, maxVisible);
  const remainingCount = items.length - maxVisible;

  function handleItemSelect(item: T, href: string | undefined) {
    if (onAvatarClick) onAvatarClick(item);
    else if (href) navigateToHref(href);
    setIsOpen(false);
  }

  return (
    <div
      className={cn(
        "flex items-center",
        "cursor-pointer select-none transition-transform hover:scale-[1.02] active:scale-[0.99] motion-reduce:transition-none",
        className,
      )}
    >
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <div
            className="flex -space-x-2 outline-none [&>[data-slot=avatar]:not(:last-child)]:mask-[radial-gradient(circle_16px_at_calc(100%+6px)_50%,transparent_99%,black_100%)]"
            tabIndex={-1}
            onFocus={(e) => e.target.blur()}
          >
            {visibleItems.map((item) => {
              const name = `${item.firstName} ${item.lastName}`.trim();
              return (
                <Avatar key={item.id} className="size-7" size={size}>
                  {item.avatarUrl && <AvatarImage alt={name} src={item.avatarUrl} />}

                  <AvatarFallback>{getInitials(item.firstName, item.lastName)}</AvatarFallback>
                </Avatar>
              );
            })}

            {remainingCount > 0 && (
              <Avatar className="size-7" size={size}>
                <AvatarFallback>+{remainingCount}</AvatarFallback>
              </Avatar>
            )}
          </div>
        </DropdownMenuTrigger>

        <DropdownMenuContent className="max-h-60 overflow-y-auto">
          {items.map((item) => {
            const name = `${item.firstName} ${item.lastName}`.trim();
            const href = avatarHref?.(item);
            const content = (
              <>
                <Avatar size="sm">
                  {item.avatarUrl && <AvatarImage alt={name} src={item.avatarUrl} />}

                  <AvatarFallback>{getInitials(item.firstName, item.lastName)}</AvatarFallback>
                </Avatar>

                <div className="flex w-full flex-col space-y-0 items-start">
                  <span className="text-sm">{name}</span>

                  {item.email && <span className="text-xs text-muted-foreground">{item.email}</span>}
                </div>
              </>
            );

            return (
              <DropdownMenuItem
                key={item.id}
                asChild={Boolean(href)}
                onSelect={(event) => {
                  if (href) {
                    event.preventDefault();
                    return;
                  }
                  handleItemSelect(item, undefined);
                }}
              >
                {href ? (
                  <a
                    href={href}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) {
                        setIsOpen(false);
                        return;
                      }
                      e.preventDefault();
                      handleItemSelect(item, href);
                    }}
                  >
                    {content}
                  </a>
                ) : (
                  content
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
