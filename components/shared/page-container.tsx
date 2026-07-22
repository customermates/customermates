import { cn } from "@/core/utils/cn";

type Props = {
  className?: string;
  children: React.ReactNode;
  padded?: boolean;
};

export function PageContainer({ className, children, padded = true }: Props) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col min-w-0 overflow-y-auto overflow-x-clip",
        padded && "gap-6 p-4 md:p-6",
        className,
      )}
      id="scroll-container"
    >
      {children}
    </div>
  );
}
