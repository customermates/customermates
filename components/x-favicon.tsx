import { GlobeAltIcon } from "@heroicons/react/24/outline";

import { XIcon } from "./x-icon";

type Props = {
  value: string;
  size?: number;
  className?: string;
};

export function XFavicon({ value, size = 16, className }: Props) {
  function isValidUrl(url: string): boolean {
    try {
      new URL(url);

      return true;
    } catch {
      return false;
    }
  }

  return isValidUrl(value) ? (
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

      <XIcon className={`hidden ${className}`} icon={GlobeAltIcon} />
    </>
  ) : (
    <XIcon className={className} icon={GlobeAltIcon} />
  );
}
