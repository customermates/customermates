"use client";

import { Card, CardContent } from "@/components/ui/card";
import { SectionBadge } from "@/components/marketing/section-badge";
import { WaveDecoration } from "@/components/marketing/wave-decoration";
import { FeatureIcon } from "@/components/shared/feature-icon";
import { ICONS } from "@/components/shared/icons";
import { AppImage } from "@/components/shared/app-image";

type FeatureItem = {
  description: string;
  icon: string;
  image?: string;
  title: string;
};

type Props = {
  badge: string;
  features: FeatureItem[];
  subtitle: string;
  title: string;
  variant?: "default" | "editorial";
};

export function FeatureSection({ badge, features, subtitle, title, variant = "default" }: Props) {
  if (variant === "editorial") {
    return (
      <section
        className="w-full border-b border-foreground/15 py-20 sm:py-24 lg:py-32"
        data-homepage-section="features"
        id="features"
      >
        <div className="mx-auto w-full max-w-[1440px] px-5 sm:px-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(180px,0.45fr)_minmax(0,1.55fr)] lg:gap-12">
            <p className="pt-1 text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">{badge}</p>

            <div>
              <h2 className="m-0 max-w-[980px] text-[clamp(2.5rem,5.2vw,5.25rem)] font-medium leading-[0.98] tracking-[-0.05em] text-balance">
                {title}
              </h2>

              <p className="mt-5 max-w-[720px] text-base leading-relaxed text-muted-foreground sm:text-lg">
                {subtitle}
              </p>
            </div>
          </div>

          <div className="-mx-5 mt-12 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-4 sm:-mx-8 sm:px-8 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 md:pb-0 lg:mt-16">
            {features.map((feature) => {
              const Icon = ICONS[feature.icon];

              return (
                <article
                  key={feature.title}
                  className="w-[78vw] max-w-[320px] shrink-0 snap-start overflow-hidden rounded-[20px] bg-muted/45 sm:w-[44vw] sm:max-w-[380px] md:w-auto md:max-w-none md:shrink md:snap-none"
                >
                  {feature.image ? (
                    <AppImage
                      alt={feature.title}
                      className="aspect-[1.45/1] w-full object-cover object-top"
                      height={900}
                      sizes="(max-width: 639px) 78vw, (max-width: 767px) 44vw, 50vw"
                      src={feature.image}
                      width={1516}
                    />
                  ) : null}

                  <div className="p-6 sm:p-7">
                    <FeatureIcon icon={Icon} />

                    <h3 className="mt-8 text-2xl font-medium leading-tight tracking-[-0.03em]">{feature.title}</h3>

                    <p className="mt-3 max-w-[560px] text-sm leading-relaxed text-muted-foreground">
                      {feature.description}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="relative isolate w-full max-w-6xl px-4 py-14 md:py-20" id="features">
      <WaveDecoration className="-right-40 top-10 hidden w-[min(820px,70%)] md:block" opacity={0.3} variant="wave-2" />

      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-20 top-1/3 size-[340px] rounded-full bg-[rgba(94,74,227,0.13)] blur-[110px]" />

        <div className="absolute right-[12%] bottom-[10%] size-[280px] rounded-full bg-[rgba(217,70,239,0.11)] blur-[90px]" />

        <div className="absolute left-1/2 top-1/4 size-[220px] -translate-x-1/2 rounded-full bg-[rgba(244,114,182,0.09)] blur-[80px]" />
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-5 h-80 bg-[radial-gradient(ellipse_60%_70%_at_50%_45%,var(--background)_0%,color-mix(in_oklab,var(--background)_80%,transparent)_40%,transparent_95%)]"
      />

      <div className="relative z-10 mb-10 text-center md:mb-16">
        <SectionBadge className="mb-4">{badge}</SectionBadge>

        <h2 className="text-x-3xl">{title}</h2>

        <p className="text-x-xl mx-auto mt-4 max-w-2xl text-subdued">{subtitle}</p>
      </div>

      <div className="relative z-10 grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
        {features.map((feature, index) => {
          const Icon = ICONS[feature.icon];

          return (
            <Card key={index} className="w-full py-4">
              <CardContent className={feature.image ? "flex flex-col gap-2" : "flex flex-col gap-3"}>
                <FeatureIcon icon={Icon} />

                <div className="flex flex-col gap-0.5">
                  <h3 className="text-base font-semibold">{feature.title}</h3>

                  <p className="text-[13px] leading-normal text-subdued">{feature.description}</p>
                </div>

                {feature.image ? (
                  <AppImage
                    alt={feature.title}
                    className="mt-1 aspect-2/1 w-full rounded-md object-cover object-top"
                    height={900}
                    src={feature.image}
                    width={1516}
                  />
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
