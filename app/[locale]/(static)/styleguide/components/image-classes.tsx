import { MarketingSection } from "@/components/marketing/marketing-section";

export function ImageClasses() {
  return (
    <>
      <MarketingSection
        description="Four classes cover every picture a public page needs. Each one is authored in light and dark from a single source, because a page can be read in either."
        title="What a picture on a public page may be"
      >
        <div className="marketing-grid mt-14 gap-y-4 lg:mt-16">
          {[
            {
              body: "Real components as nodes, for a capability that has no screen of its own.",
              title: "Schematic",
            },
            { body: "A real capture of the running product, matted in a token frame.", title: "Product proof" },
            {
              body: "A drawn product window, animatable and filmable, built from the real components.",
              title: "Scene",
            },
            { body: "The 1200×630 card a link unfurls into. Dark on both site themes.", title: "Social card" },
          ].map((item) => (
            <article
              key={item.title}
              className="col-span-12 rounded-card border border-border bg-card p-7 sm:col-span-6 lg:col-span-3"
            >
              <h3 className="m-0 font-medium leading-snug">{item.title}</h3>

              <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
            </article>
          ))}
        </div>
      </MarketingSection>
    </>
  );
}
