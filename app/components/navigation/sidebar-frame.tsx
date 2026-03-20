"use client";

import { Bars3Icon } from "@heroicons/react/24/outline";
import { Button } from "@heroui/button";
import { cn } from "@heroui/theme";

import { XIcon } from "@/components/x-icon";

type Props = {
  children: React.ReactNode;
  desktopWidthClassName?: string;
  isMobileOpen: boolean;
  onMobileClose: () => void;
  onMobileOpen: () => void;
};

export function SidebarFrame({
  children,
  desktopWidthClassName = "md:w-64",
  isMobileOpen,
  onMobileClose,
  onMobileOpen,
}: Props) {
  return (
    <>
      <Button
        isIconOnly
        className={cn("md:hidden fixed top-3 left-3 z-50 bg-background", isMobileOpen ? "hidden" : "")}
        size="sm"
        variant="bordered"
        onPress={onMobileOpen}
      >
        <XIcon icon={Bars3Icon} />
      </Button>

      {isMobileOpen ? (
        <button className="fixed inset-0 bg-black/50 z-40 md:hidden" type="button" onClick={onMobileClose} />
      ) : null}

      <aside
        className={cn(
          "fixed left-0 top-0 h-full w-64 min-h-0 border-r border-divider overflow-hidden flex flex-col z-50 gap-1 py-3 bg-content1 transform transition-transform duration-200 ease-out md:relative md:z-40 md:self-stretch md:h-full md:shrink-0 md:translate-x-0",
          isMobileOpen ? "translate-x-0" : "-translate-x-full",
          desktopWidthClassName,
        )}
      >
        {children}
      </aside>
    </>
  );
}
