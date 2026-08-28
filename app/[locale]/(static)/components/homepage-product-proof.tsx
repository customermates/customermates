import type { HomepageProductProof as HomepageProductProofContent } from "@/core/fumadocs/schemas/homepage";

import { Clock3, Play } from "lucide-react";

import { MarketingSection } from "@/components/marketing/marketing-section";

import { HomepageViewportVideo } from "./homepage-viewport-video";

export function HomepageProductProof({ proof }: { proof: HomepageProductProofContent }) {
  return (
    <MarketingSection className="py-16 sm:py-20 lg:py-24" id="walkthrough-video" tone="inverse">
      <div className="marketing-grid gap-y-6">
        <div className="col-span-12 lg:col-start-2 lg:col-end-12">
          <div className="marketing-grid items-end gap-y-5">
            <div className="col-span-12 lg:col-span-5">
              <p className="text-eyebrow flex items-center gap-2">
                <Play aria-hidden className="size-3.5 fill-current" />

                {proof.videoLabel}

                <span aria-hidden className="text-border">
                  /
                </span>

                <span className="inline-flex items-center gap-1.5">
                  <Clock3 aria-hidden className="size-3.5" />
                  00:57
                </span>
              </p>

              <h2 className="mt-4 text-2xl font-medium tracking-tight sm:text-3xl">{proof.videoHeading}</h2>
            </div>

            <p className="col-span-12 text-sm leading-relaxed text-muted-foreground lg:col-start-7 lg:col-end-13">
              {proof.videoDescription}
            </p>
          </div>

          <div className="relative mt-6 aspect-video w-full overflow-hidden rounded-card border border-border/70 bg-sidebar shadow-xl shadow-black/5">
            <HomepageViewportVideo
              ariaLabel={proof.videoTitle}
              className="absolute inset-0 size-full object-cover"
              src={proof.videoSrc}
            />
          </div>
        </div>
      </div>
    </MarketingSection>
  );
}
