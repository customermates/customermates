import { Braces, Database, RadioTower } from "lucide-react";

import { MarketingSection } from "@/components/marketing/marketing-section";
import { NativeAutomationProviderIdentity } from "@/components/marketing/visuals/native-visual-primitives";
import { VisualArtboard } from "@/components/marketing/visuals/visual-artboard";

type Props = {
  architecture: {
    boundary: string;
    crmDescription: string;
    crmTitle: string;
    description: string;
    interfaceTitle: string;
    title: string;
    workflowDescription: string;
  };
};

export function AutomationDemo({ architecture }: Props) {
  const { boundary, crmDescription, crmTitle, description, interfaceTitle, title, workflowDescription } = architecture;

  return (
    <MarketingSection description={description} id="architecture" title={title} tone="canvas">
      <VisualArtboard aria-label={title} className="mx-auto mt-10 min-h-0 max-w-5xl border border-border p-5 sm:p-8">
        <div
          aria-hidden
          className="absolute inset-0 opacity-40 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:36px_36px] [mask-image:radial-gradient(ellipse_85%_90%_at_50%_50%,black,transparent_95%)]"
        />

        <div className="relative grid items-stretch gap-3 lg:grid-cols-[1fr_0.8fr_1fr]">
          <div className="rounded-xl border border-border bg-background p-5">
            <Database aria-hidden className="size-5 text-subdued" strokeWidth={1.75} />

            <p className="mt-5 text-sm font-medium">{crmTitle}</p>

            <p className="mt-2 text-xs leading-5 text-subdued">{crmDescription}</p>
          </div>

          <div className="rounded-xl border border-border bg-card/75 p-5">
            <RadioTower aria-hidden className="size-5 text-subdued" strokeWidth={1.75} />

            <p className="mt-5 text-meta">{interfaceTitle}</p>

            <div className="mt-3 flex flex-wrap gap-2">
              {["REST", "Webhooks", "MCP"].map((label) => (
                <span key={label} className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs">
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border-strong bg-background p-5 shadow-sm">
            <NativeAutomationProviderIdentity descriptor={workflowDescription} provider="n8n" />

            <div className="mt-5 border-t border-border pt-4">
              <div className="flex items-start gap-2.5 text-xs leading-5 text-subdued">
                <Braces aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />

                <p>{boundary}</p>
              </div>
            </div>
          </div>
        </div>
      </VisualArtboard>
    </MarketingSection>
  );
}
