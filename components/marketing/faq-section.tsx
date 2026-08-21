import { getTranslations } from "next-intl/server";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AppLink } from "@/components/shared/app-link";

type FAQItem = {
  content: string;
  id: string;
  title: string;
};

type Props = {
  faqs: FAQItem[];
  title?: string;
  variant?: "default" | "editorial";
};

export async function FAQSection({ faqs, title, variant = "default" }: Props) {
  if (!faqs.length) return null;

  const t = await getTranslations();

  if (variant === "editorial") {
    return (
      <section className="w-full border-b border-foreground/15 py-20 sm:py-24 lg:py-32" data-homepage-section="faq">
        <div className="mx-auto grid w-full max-w-[1440px] gap-12 px-5 sm:px-8 lg:grid-cols-[minmax(260px,0.7fr)_minmax(0,1.3fr)] lg:gap-20">
          <div>
            <p className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
              {t("FAQSection.label")}
            </p>

            {title ? (
              <h2 className="mt-5 max-w-[560px] text-[clamp(2.5rem,4.8vw,4.75rem)] font-medium leading-[0.98] tracking-[-0.05em] text-balance">
                {title}
              </h2>
            ) : null}

            {/* eslint-disable react/jsx-newline */}
            <p className="mt-6 max-w-[420px] text-sm leading-relaxed text-muted-foreground">
              {t("FAQSection.contactIntro")}{" "}
              <AppLink appearance="inline" className="font-medium text-foreground" href="/contact">
                {t("FAQSection.contactCta")}
              </AppLink>
            </p>
            {/* eslint-enable react/jsx-newline */}
          </div>

          <Accordion collapsible className="border-t border-foreground/20" defaultValue={faqs[0].id} type="single">
            {faqs.map((faq) => (
              <AccordionItem key={faq.id} className="border-b border-foreground/20" value={faq.id}>
                <AccordionTrigger className="py-6 text-left text-lg font-medium tracking-[-0.02em] sm:py-7 sm:text-xl">
                  {faq.title}
                </AccordionTrigger>

                <AccordionContent className="max-w-[760px] pb-7 text-sm leading-relaxed text-muted-foreground sm:text-base">
                  {faq.content}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>
    );
  }

  return (
    <section className="relative isolate mx-auto w-full max-w-[860px] overflow-visible px-4 py-20">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-14 top-10 size-[260px] rounded-full bg-[rgba(18,148,144,0.10)] blur-[70px]" />

        <div className="absolute -right-10 bottom-16 size-[220px] rounded-full bg-[rgba(94,74,227,0.12)] blur-[70px]" />
      </div>

      <div className="relative mb-9 text-center">
        <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[#129490]/12 px-3 py-1 font-mono text-[12px] font-medium uppercase tracking-[0.05em] text-[#0e726f]">
          <span className="size-[5px] rounded-full bg-[#129490]" />

          {t("FAQSection.label")}
        </span>

        {title ? <h2 className="m-0 mt-3 text-x-3xl">{title}</h2> : null}

        {/* eslint-disable react/jsx-newline */}
        <p className="mx-auto mt-3 max-w-[480px] text-sm text-muted-foreground">
          {t("FAQSection.contactIntro")}{" "}
          <AppLink appearance="inline" className="font-medium" href="/contact">
            {t("FAQSection.contactCta")}
          </AppLink>
        </p>
        {/* eslint-enable react/jsx-newline */}

        <div className="mt-6 flex items-center justify-center gap-3.5">
          <span className="h-px w-[60px] bg-linear-to-r from-transparent via-border to-transparent" />

          <svg aria-hidden className="text-primary opacity-60" height="10" viewBox="0 0 10 10" width="10">
            <path d="M5 0 L10 5 L5 10 L0 5 Z" fill="currentColor" />
          </svg>

          <span className="h-px w-[60px] bg-linear-to-r from-transparent via-border to-transparent" />
        </div>
      </div>

      <Accordion collapsible className="flex flex-col gap-3" defaultValue={faqs[0].id} type="single">
        {faqs.map((faq) => (
          <AccordionItem
            key={faq.id}
            className="rounded-xl border border-border bg-card px-2 last:border-b"
            value={faq.id}
          >
            <AccordionTrigger className="text-x-lg px-4 py-5">{faq.title}</AccordionTrigger>

            <AccordionContent className="text-x-lg px-4 pb-5">{faq.content}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
