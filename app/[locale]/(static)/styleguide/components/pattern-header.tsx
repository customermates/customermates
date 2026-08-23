import { MarketingContainer } from "@/components/marketing/marketing-container";

export type PatternSpec = {
  columns: string;
  id: string;
  name: string;
  when: string;
};

export function PatternHeader({ columns, id, name, when }: PatternSpec) {
  return (
    <MarketingContainer className="pt-16">
      <div className="flex flex-col gap-2 border-t border-border-strong pt-5 lg:flex-row lg:items-baseline lg:justify-between lg:gap-8">
        <div className="flex items-baseline gap-3">
          <code className="font-mono text-sm text-primary">{id}</code>

          <span className="font-medium">{name}</span>
        </div>

        <div className="flex flex-col gap-1 lg:flex-row lg:items-baseline lg:gap-8">
          <span className="text-meta lg:text-right">{when}</span>

          <code className="text-meta shrink-0 font-mono">{columns}</code>
        </div>
      </div>
    </MarketingContainer>
  );
}
