"use client";

import type { ComparisonTable } from "@/core/fumadocs/schemas/pricing";

import { CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "@heroui/button";

import { XCard } from "@/components/x-card/x-card";
import { XIcon } from "@/components/x-icon";
import { XLink } from "@/components/x-link";

type Props = ComparisonTable;

function ComparisonCell({ value }: { value: string | boolean }) {
  if (typeof value === "boolean") {
    return (
      <div className="flex items-center justify-center px-6">
        <XIcon
          className={`h-5 w-5 mx-auto ${value ? "text-primary-600 dark:text-primary-400" : "text-default-500 dark:text-default-400"}`}
          icon={value ? CheckIcon : XMarkIcon}
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
    <section className="pb-8 w-full">
      <div className="max-w-7xl mx-auto px-4 overflow-x-auto">
        <XCard className="min-w-[800px] bg-transparent">
          <div className="grid grid-cols-4 gap-0 py-6 bg-content1">
            <div className="flex items-center px-6 border-r border-divider text-x-xl font-semibold">{header}</div>

            <div className="flex flex-col items-center justify-center px-6 border-r border-divider">
              <div className="font-semibold text-x-lg text-center mb-3">{plans.basic.name}</div>

              <Button as={XLink} color="default" href={plans.basic.buttonHref} size="sm" variant="flat">
                {plans.basic.button}
              </Button>
            </div>

            <div className="flex flex-col items-center justify-center px-6 border-r border-divider">
              <div className="font-semibold text-x-lg text-primary-600 dark:text-primary-400 text-center mb-3">
                {plans.pro.name}
              </div>

              <Button as={XLink} color="primary" href={plans.pro.buttonHref} size="sm">
                {plans.pro.button}
              </Button>
            </div>

            <div className="flex flex-col items-center justify-center px-6">
              <div className="font-semibold text-x-lg text-center mb-3">{plans.enterprise.name}</div>

              <Button as={XLink} color="primary" href={plans.enterprise.buttonHref} size="sm">
                {plans.enterprise.button}
              </Button>
            </div>
          </div>

          {sections.map((section, sectionIndex) => (
            <div key={sectionIndex}>
              {sectionIndex > 0 && (
                <div className="grid grid-cols-4 gap-0 py-3 border-b border-divider bg-content1">
                  <div className="flex items-center px-6 border-r border-divider">
                    <h3 className="font-semibold text-base">{section.title}</h3>
                  </div>

                  <div className="border-r border-divider" />

                  <div className="border-r border-divider" />

                  <div />
                </div>
              )}

              {section.rows.map((row, rowIndex) => (
                <div
                  key={rowIndex}
                  className="grid grid-cols-4 gap-0 py-3 hover:bg-content1 transition-colors border-b border-divider last:border-b-0"
                >
                  <div className="flex items-center px-6 border-r border-divider">
                    <span className="text-x-sm text-subdued">{row.label}</span>
                  </div>

                  <div className="border-r border-divider">
                    <ComparisonCell value={row.basic} />
                  </div>

                  <div className="border-r border-divider">
                    <ComparisonCell value={row.pro} />
                  </div>

                  <div>
                    <ComparisonCell value={row.enterprise} />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </XCard>
      </div>
    </section>
  );
}
