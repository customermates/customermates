import { MarketingSection } from "@/components/marketing/marketing-section";
import { FeatureIcon } from "@/components/shared/feature-icon";
import { ICONS } from "@/components/shared/icons";

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
};

export function FeatureSection({ badge, features, subtitle, title }: Props) {
  return (
    <MarketingSection id="features" tone="canvas">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-eyebrow">{badge}</p>

        <h2 className="text-display-sm mt-5">{title}</h2>

        <p className="text-lede mx-auto mt-5">{subtitle}</p>
      </div>

      <div className="mt-10 grid border-y border-border md:grid-cols-2">
        {features.map((feature) => {
          const Icon = ICONS[feature.icon];

          return (
            <article
              key={feature.title}
              className="border-b border-border p-6 last:border-b-0 md:border-r md:p-8 md:[&:nth-child(even)]:border-r-0 md:[&:nth-last-child(-n+2)]:border-b-0"
            >
              <FeatureIcon icon={Icon} />

              <h3 className="mt-5 text-base font-medium">{feature.title}</h3>

              <p className="mt-2 text-sm leading-6 text-subdued">{feature.description}</p>
            </article>
          );
        })}
      </div>
    </MarketingSection>
  );
}
