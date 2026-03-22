import { cn } from "@heroui/theme";

type Props = {
  className?: string;
  children: React.ReactNode;
};

export function XPageCenter({ className, children }: Props) {
  return <div className={cn("w-full h-full flex flex-1 items-center justify-center p-4", className)}>{children}</div>;
}
