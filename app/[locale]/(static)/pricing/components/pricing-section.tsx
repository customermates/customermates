"use client";

import type { Pricing } from "@/core/fumadocs/schemas/pricing";

import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { PricingCardComponent } from "./pricing-card";

type Props = Pricing;

const MONTHLY_PER_USER = 9;
const YEARLY_MONTHLY_EQUIVALENT_PER_USER = 7;
const YEARLY_DISCOUNT_PERCENT = Math.round((1 - YEARLY_MONTHLY_EQUIVALENT_PER_USER / MONTHLY_PER_USER) * 100);

export function PricingSection({
  ariaLabelSlider,
  ariaLabelTabs,
  monthly,
  pricingCards: mdxPricingCards,
  users,
  yearly,
}: Props) {
  const [userCount, setUserCount] = useState(1);
  const [isAnnual, setIsAnnual] = useState(true);

  const maxUsers = 25;
  const yearlyTitle = (
    <>
      {yearly}

      <span className="ml-1 text-x-xs font-bold">{`-${YEARLY_DISCOUNT_PERCENT}%`}</span>
    </>
  );

  return (
    <>
      <div className="max-w-xl mx-auto mb-8">
        <div className="flex justify-between mb-6 items-center">
          <div>
            <h3 className="text-x-lg mb-2">{users}</h3>

            <div className="text-x-3xl text-primary dark:text-primary">{userCount}</div>
          </div>

          <Tabs
            aria-label={ariaLabelTabs}
            value={isAnnual ? "yearly" : "monthly"}
            onValueChange={(key) => setIsAnnual(key === "yearly")}
          >
            <TabsList>
              <TabsTrigger value="monthly">{monthly}</TabsTrigger>

              <TabsTrigger value="yearly">{yearlyTitle}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <Slider
          aria-label={ariaLabelSlider}
          className="w-full mb-3"
          max={maxUsers}
          min={1}
          step={1}
          value={[userCount]}
          onValueChange={(values) => setUserCount(values[0] ?? 1)}
        />

        <div className="flex justify-between text-x-xs text-muted-foreground">
          {[1, 5, 10, 15, 20, maxUsers].map((value) => (
            <span key={value} className={userCount >= value ? "font-semibold text-primary" : ""}>
              {value}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-7xl mx-auto justify-center items-stretch">
        {mdxPricingCards.map((card, index) => {
          const hasDynamicPrice = card.title.toLowerCase() === "pro";
          const perUserPerMonth = isAnnual ? YEARLY_MONTHLY_EQUIVALENT_PER_USER : MONTHLY_PER_USER;
          const displayPrice = hasDynamicPrice ? `${userCount * perUserPerMonth}` : card.price;

          return <PricingCardComponent key={index} card={card} displayPrice={displayPrice} />;
        })}
      </div>
    </>
  );
}
