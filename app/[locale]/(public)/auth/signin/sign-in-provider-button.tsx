"use client";

import { Button } from "@heroui/button";
import { cn } from "@heroui/theme";

import { XImage } from "@/components/x-image";

type Props = {
  className?: string;
  providerId: string;
  label: string;
  isLoading?: boolean;
  onPress?: () => void;
};

export default function SignInProviderButton({ className, providerId, label, isLoading, onPress }: Props) {
  return (
    <Button
      key={providerId}
      className={cn("w-full min-w-0", className)}
      isLoading={isLoading}
      startContent={
        <XImage
          alt={label}
          className="mr-1 shrink-0 brightness-0 dark:invert"
          height={18}
          src={`${providerId}-icon.svg`}
          width={18}
        />
      }
      variant="bordered"
      onPress={onPress}
    >
      <span className="truncate min-w-0">{label}</span>
    </Button>
  );
}
