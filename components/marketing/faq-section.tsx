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
};

export async function FAQSection({ faqs, title }: Props) {
  if (!faqs.length) return null;

  const t = await getTranslations();

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
          <AppLink className="font-medium text-primary no-underline hover:underline" href="/contact">
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
          <AccordionItem key={faq.id} className="rounded-xl border-b-0 bg-card px-2" value={faq.id}>
            <AccordionTrigger className="text-x-lg px-4 py-5">{faq.title}</AccordionTrigger>

            <AccordionContent className="text-x-lg px-4 pb-5">{faq.content}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
