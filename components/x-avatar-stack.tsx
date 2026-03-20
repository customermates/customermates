import { Avatar } from "@heroui/avatar";
import { Dropdown, DropdownTrigger, DropdownMenu } from "@heroui/dropdown";
import { useState } from "react";

import { XDropdownItem } from "./x-inputs/x-dropdown-item";

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
  size?: "sm" | "md" | "lg";
  className?: string;
  onAvatarClick?: (item: T) => void;
};

export function XAvatarStack<T extends AvatarStackItem>({
  items,
  maxVisible = 3,
  size = "sm",
  className = "",
  onAvatarClick,
}: Props<T>) {
  const [isOpen, setIsOpen] = useState(false);

  if (!items?.length) return null;

  const visibleItems = items.slice(0, maxVisible);
  const remainingCount = items.length - maxVisible;

  function handleAvatarClick(item: T) {
    onAvatarClick?.(item);
    setIsOpen(false);
  }

  const baseClassName =
    "cursor-pointer select-none transform-gpu hover:opacity-hover active:scale-[0.97] transition-transform-colors-opacity motion-reduce:transition-none";
  const combinedClassName = `${className} ${baseClassName}`.trim();

  return (
    <div className={`flex items-center ${combinedClassName}`}>
      <Dropdown isOpen={isOpen} onOpenChange={setIsOpen}>
        <DropdownTrigger>
          <div className="flex -space-x-3" tabIndex={-1} onFocus={(e) => e.target.blur()}>
            {visibleItems.map((item) => (
              <Avatar
                key={item.id}
                showFallback
                className="border-2 border-content1"
                name={`${item.firstName} ${item.lastName}`.trim()}
                size={size}
                src={item.avatarUrl ?? undefined}
              />
            ))}

            {remainingCount > 0 && (
              <Avatar showFallback className="border-2 border-content1" name={`+ ${remainingCount}`} size={size} />
            )}
          </div>
        </DropdownTrigger>

        <DropdownMenu
          className="max-h-60 overflow-y-auto"
          onAction={(key) => {
            const item = items.find((item) => item.id === key);

            if (item) handleAvatarClick(item);
          }}
        >
          {items.map((item) =>
            XDropdownItem({
              key: item.id,
              startContent: (
                <Avatar
                  showFallback
                  name={`${item.firstName} ${item.lastName}`.trim()}
                  size="sm"
                  src={item.avatarUrl ?? undefined}
                />
              ),
              children: (
                <div className="flex w-full flex-col space-y-0 items-start">
                  <span className="text-x-sm">{`${item.firstName} ${item.lastName}`.trim()}</span>

                  {item.email && <span className="text-x-xs text-default-500">{item.email}</span>}
                </div>
              ),
            }),
          )}
        </DropdownMenu>
      </Dropdown>
    </div>
  );
}
