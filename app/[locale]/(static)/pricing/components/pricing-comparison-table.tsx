"use client";

import type { ComparisonTable } from "@/core/fumadocs/schemas/pricing";

import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";

import { AppCard } from "@/components/card/app-card";
import { Icon } from "@/components/shared/icon";
import { AppLink } from "@/components/shared/app-link";

type Props = ComparisonTable;

function ComparisonCell({ value }: { value: string | boolean }) {
  if (typeof value === "boolean") {
    return (
      <div className="flex items-center justify-center px-6">
        <Icon
          className={`size-5 mx-auto ${value ? "text-primary dark:text-primary" : "text-muted-foreground dark:text-muted-foreground"}`}
          icon={value ? Check : X}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center px-6">
      <span className="text-x-sm text-center block">{value}</span>
    </div>
  );
}

export function PricingComparisonTable({ header, plans, sections }: Props) {
  return (
    <section className="relative pb-8 w-full">
      <div className="max-w-7xl mx-auto px-4 overflow-x-auto">
        <AppCard className="min-w-[600px] overflow-hidden">
          <div className="grid grid-cols-3 gap-0 py-6">
            <div className="flex items-center px-6 text-x-xl font-semibold">{header}</div>

            <div className="flex flex-col items-center justify-center px-6">
              <div className="font-semibold text-x-lg text-primary dark:text-primary text-center mb-3">
                {plans.pro.name}
              </div>

              <Button asChild size="sm">
                <AppLink href={plans.pro.buttonHref}>{plans.pro.button}</AppLink>
              </Button>
            </div>

            <div className="flex flex-col items-center justify-center px-6">
              <div className="font-semibold text-x-lg text-center mb-3">{plans.enterprise.name}</div>

              <Button asChild size="sm">
                <AppLink href={plans.enterprise.buttonHref}>{plans.enterprise.button}</AppLink>
              </Button>
            </div>
          </div>

          {sections.map((section, sectionIndex) => (
            <div key={sectionIndex}>
              {sectionIndex > 0 && (
                <div className="grid grid-cols-3 gap-0 py-3 bg-muted/20 dark:bg-muted/40 border-t border-border/50">
                  <div className="flex items-center px-6">
                    <h3 className="font-semibold text-base">{section.title}</h3>
                  </div>

                  <div />

                  <div />
                </div>
              )}

              {section.rows.map((row, rowIndex) => (
                <div
                  key={rowIndex}
                  className="grid grid-cols-3 gap-0 py-3 border-t border-border/50 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center px-6">
                    <span className="text-x-sm text-subdued">{row.label}</span>
                  </div>

                  <div>
                    <ComparisonCell value={row.pro} />
                  </div>

                  <div>
                    <ComparisonCell value={row.enterprise} />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </AppCard>
      </div>
    </section>
  );
}
