import { Globe } from "lucide-react";

import { cn } from "@/core/utils/cn";

import { Icon } from "./icon";

type Props = {
  value: string;
  size?: number;
  className?: string;
};

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function Favicon({ value, size = 16, className }: Props) {
  if (!isValidUrl(value)) return <Icon className={className} icon={Globe} />;

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt="favicon"
        className={className}
        height={size}
        src={`${new URL(value).origin}/favicon.ico`}
        style={{ objectFit: "contain" }}
        width={size}
        onError={(e) => {
          e.currentTarget.style.display = "none";
          e.currentTarget.nextElementSibling?.classList.remove("hidden");
        }}
      />

      <Icon className={cn("hidden", className)} icon={Globe} />
    </>
  );
}
