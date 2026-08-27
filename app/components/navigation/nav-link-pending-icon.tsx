"use client";

import { LoaderCircle } from "lucide-react";
import { useLinkStatus } from "next/link";
import { useEffect, useRef } from "react";
import type { SVGProps } from "react";

import { Icon } from "@/components/shared/icon";

type Props = {
  icon: React.FC<SVGProps<SVGSVGElement>>;
};

export function NavLinkPendingIcon({ icon }: Props) {
  const { pending } = useLinkStatus();
  const wrapperRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const link = wrapperRef.current?.closest("a");
    if (!link) return;

    if (pending) link.setAttribute("aria-busy", "true");
    else link.removeAttribute("aria-busy");

    return () => link.removeAttribute("aria-busy");
  }, [pending]);

  return (
    <span
      ref={wrapperRef}
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center"
      data-navigation-pending={pending ? "true" : "false"}
    >
      <Icon
        className={pending ? "animate-spin motion-reduce:animate-none" : undefined}
        icon={pending ? LoaderCircle : icon}
      />
    </span>
  );
}
