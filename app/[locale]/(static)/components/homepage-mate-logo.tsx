import { AppImage } from "@/components/shared/app-image";
import { cn } from "@/core/utils/cn";

export function HomepageMateLogo({ className }: { className?: string }) {
  return (
    <AppImage
      aria-hidden
      alt=""
      className={cn("homepage-mate-logo size-4 shrink-0", className)}
      height={16}
      src="customermates-square.svg"
      width={16}
    />
  );
}
