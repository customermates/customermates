import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/core/utils/cn";
import { initialsFor } from "@/core/utils/initials";

import { workspaceAvatarStyle } from "./workspace-identity";

type Props = {
  companyId: string;
  name: string;
  size?: "sm" | "default" | "lg" | "xl";
  className?: string;
};

export function WorkspaceAvatar({ companyId, name, size = "default", className }: Props) {
  const initials = initialsFor(name);

  return (
    <Avatar aria-hidden className={className} size={size}>
      <AvatarFallback
        className={cn("font-semibold", size === "sm" && "group-data-[size=sm]/avatar:text-[9px]")}
        style={workspaceAvatarStyle(companyId)}
      >
        {size === "sm" ? initials.slice(0, 1) : initials}
      </AvatarFallback>
    </Avatar>
  );
}
