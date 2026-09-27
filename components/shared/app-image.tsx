import type { ComponentProps } from "react";

import Image from "next/image";

import { cn } from "@/core/utils/cn";

type Props = ComponentProps<typeof Image>;

export function AppImage({ className, src, ...props }: Props) {
  return (
    <>
      <Image
        className={cn(className, "dark:hidden")}
        decoding="async"
        loading="lazy"
        src={`/images/light/${src as string}`}
        {...props}
      />

      <Image
        className={cn(className, "not-dark:hidden")}
        decoding="async"
        loading="lazy"
        src={`/images/dark/${src as string}`}
        {...props}
      />
    </>
  );
}
