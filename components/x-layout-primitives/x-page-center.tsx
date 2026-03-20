import { cn } from "@heroui/theme";

type Props = {
  className?: string;
  children: React.ReactNode;
  showGridBackground?: boolean;
};

export function XPageCenter({ className, children, showGridBackground = false }: Props) {
  return (
    <div className={cn("w-full h-full flex flex-1 items-center justify-center p-4", className)}>
      {showGridBackground && (
        <div className="fixed inset-0 -top-32 md:-top-48 bg-size-[40px_40px] bg-[linear-gradient(to_right,#d4d4d4_1px,transparent_1px),linear-gradient(to_bottom,#d4d4d4_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#262626_1px,transparent_1px),linear-gradient(to_bottom,#262626_1px,transparent_1px)] mask-[linear-gradient(to_bottom,black,transparent_80%),linear-gradient(to_right,transparent,black_10%,black_90%,transparent)] mask-intersect" />
      )}

      {children}
    </div>
  );
}
