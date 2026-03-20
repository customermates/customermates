import { cn } from "@heroui/theme";

type Props = {
  className?: string;
  children: React.ReactNode;
};

export function XPageContainer({ className, children }: Props) {
  return (
    <div
      className={cn("flex flex-col relative flex-1 overflow-auto p-4 md:p-6 space-y-4 md:space-y-6", className)}
      id="scroll-container"
    >
      {children}
    </div>
  );
}
