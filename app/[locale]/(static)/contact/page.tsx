import { Mail, MessageCircle, Zap } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { ContactForm } from "./contact-form";

import { WaveDecoration } from "@/components/marketing/wave-decoration";

export default async function ContactPage() {
  const t = await getTranslations("ContactPage");

  const highlights = [
    { icon: Zap, title: t("highlights.fast.title"), body: t("highlights.fast.body") },
    { icon: MessageCircle, title: t("highlights.personal.title"), body: t("highlights.personal.body") },
    { icon: Mail, title: t("highlights.direct.title"), body: t("highlights.direct.body") },
  ];

  return (
    <div className="flex flex-1 flex-col items-center">
      <section className="relative isolate flex w-full flex-1 items-center">
        <WaveDecoration
          className="-top-24 -left-40 w-[min(1080px,90vw)] md:-top-40 md:-left-60"
          opacity={0.5}
          variant="wave-1"
        />

        <WaveDecoration
          className="-top-16 right-0 hidden w-[min(720px,60vw)] md:block md:-top-8 md:-right-24"
          opacity={0.35}
          variant="wave-2"
        />

        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-16 z-[5] h-[760px] bg-[radial-gradient(ellipse_70%_75%_at_50%_50%,var(--background)_0%,color-mix(in_oklab,var(--background)_85%,transparent)_25%,color-mix(in_oklab,var(--background)_55%,transparent)_50%,color-mix(in_oklab,var(--background)_20%,transparent)_75%,transparent_100%)]"
        />

        <div className="relative z-10 mx-auto max-w-6xl px-4 py-12 md:py-20">
          <div className="grid gap-10 md:grid-cols-5 md:gap-12 lg:gap-16">
            <div className="flex flex-col gap-6 md:col-span-2">
              <h1 className="text-x-4xl">{t("title")}</h1>

              <p className="text-x-lg text-subdued">{t("description")}</p>

              <ul className="flex flex-col gap-4 pt-2">
                {highlights.map(({ icon: Icon, title, body }) => (
                  <li key={title} className="flex gap-3">
                    <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="size-4" />
                    </div>

                    <div>
                      <p className="font-medium">{title}</p>

                      <p className="text-x-sm text-subdued">{body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="md:col-span-3">
              <ContactForm />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
