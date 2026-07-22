"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/core/utils/cn";

import { AppImage } from "@/components/shared/app-image";

type Props = {
  className?: string;
  providerId: string;
  label: string;
  isLoading?: boolean;
  onClick?: () => void;
};

export default function SignInProviderButton({ className, providerId, label, isLoading, onClick }: Props) {
  return (
    <Button
      key={providerId}
      className={cn("w-full min-w-0", className)}
      disabled={isLoading}
      variant="outline"
      onClick={onClick}
    >
      <AppImage
        alt={label}
        className="mr-1 shrink-0 brightness-0 dark:invert"
        height={18}
        src={`${providerId}-icon.svg`}
        width={18}
      />

      <span className="truncate min-w-0">{label}</span>
    </Button>
  );
}
