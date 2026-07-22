import { Button } from "@react-email/components";

import { cn } from "@/core/utils/cn";

type Props = {
  href: string;
  children: string;
  className?: string;
};

export function EmailButton({ href, children, className }: Props) {
  return (
    <Button
      className={cn(
        "rounded-lg px-4 min-w-20 h-10 bg-primary-400 hover:bg-primary-500 active:bg-primary-600 text-white no-underline inline-flex items-center justify-center",
        className,
      )}
      href={href}
    >
      {children}
    </Button>
  );
}
