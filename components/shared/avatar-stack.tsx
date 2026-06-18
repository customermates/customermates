"use client";

import { Avatar } from "@/components/ui/avatar";
import { OverlappingStack } from "@/components/shared/overlapping-stack";
import { StackDropdownItem } from "@/components/shared/stack-dropdown-item";
import { useNavigateToHref } from "@/components/entity-detail/hooks/use-entity-drawer-stack";

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

export function AvatarStack<T extends AvatarStackItem>({
  items,
  maxVisible = 3,
  size = "default",
  className = "",
  onAvatarClick,
  avatarHref,
}: Props<T>) {
  const navigateToHref = useNavigateToHref();

  return (
    <OverlappingStack
      badgeKey={(item) => item.id}
      badges={items}
      className={className}
      maxVisible={maxVisible}
      renderBadge={(item) => <Avatar name={[item.firstName, item.lastName]} size={size} src={item.avatarUrl} />}
      renderOverflow={(count) => <Avatar fallback={`+${count}`} size={size} />}
      renderRow={(item, close) => {
        const name = `${item.firstName} ${item.lastName}`.trim();
        const href = avatarHref?.(item);
        return (
          <StackDropdownItem
            close={close}
            href={href}
            onActivate={() => {
              if (onAvatarClick) onAvatarClick(item);
              else if (href) navigateToHref(href);
            }}
          >
            <Avatar name={[item.firstName, item.lastName]} size="sm" src={item.avatarUrl} />

            <div className="flex w-full flex-col items-start space-y-0">
              <span className="text-sm">{name}</span>

              {item.email && <span className="text-muted-foreground text-xs">{item.email}</span>}
            </div>
          </StackDropdownItem>
        );
      }}
      rowKey={(item) => item.id}
      rows={items}
    />
  );
}
