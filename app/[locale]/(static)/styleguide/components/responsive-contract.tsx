import { GridReadout } from "./style-readout";

import { MarketingSection } from "@/components/marketing/marketing-section";

const BREAKPOINTS = [
  { gap: "0.5rem", gutter: "1.25rem", min: "0", name: "base", nav: "drawer" },
  {
    gap: "1rem",
    gutter: "2rem",
    min: "40rem · 640px",
    name: "sm",
    nav: "drawer",
  },
  {
    gap: "1rem",
    gutter: "2rem",
    min: "48rem · 768px",
    name: "md",
    nav: "drawer",
  },
  {
    gap: "1rem",
    gutter: "2rem",
    min: "56rem · 896px",
    name: "nav",
    nav: "bar",
  },
  {
    gap: "1.5rem",
    gutter: "2rem",
    min: "64rem · 1024px",
    name: "lg",
    nav: "bar",
  },
];

const TYPE_LADDER = [
  { at1440: "74.9px", at375: "40px", at768: "52.9px", role: ".text-display" },
  { at1440: "48px", at375: "32px", at768: "37.9px", role: ".text-display-sm" },
  { at1440: "18px", at375: "16px", at768: "18px", role: ".text-lede" },
];

const COLLAPSE = [
  { at: "md · 768px", pattern: "S-01 Feature pair", rule: "12 → 6 / 6" },
  {
    at: "sm · 640px, then lg · 1024px",
    pattern: "S-02 Capability grid",
    rule: "12 → 6 → 3",
  },
  {
    at: "lg · 1024px",
    pattern: "S-03 / S-04 Split",
    rule: "12 → 5 + 5, media placed by row-start",
  },
  { at: "md · 768px", pattern: "S-05 Metric row", rule: "6 → 3" },
  { at: "md · 768px", pattern: "S-06 Two-column verdict", rule: "12 → 6 / 6" },
  {
    at: "never",
    pattern: "S-08 Numbered sequence",
    rule: "one vertical rail at every width",
  },
  {
    at: "never",
    pattern: "S-09 Pull quote",
    rule: "one column at every width",
  },
  {
    at: "never",
    pattern: "S-07 Channel strip",
    rule: "wraps, centred at every width",
  },
  {
    at: "never",
    pattern: "S-10 Product proof",
    rule: "full container width at every width",
  },
  {
    at: "never",
    pattern: "S-11 Closing panel",
    rule: "stacked at every width",
  },
];

export function ResponsiveContract() {
  return (
    <>
      <MarketingSection
        description="Twelve columns at every width, with the gutter stepping instead of the count. A two-up, three-up or four-up row is a span change, so rows stay optically aligned with the rows above them."
        title="The grid"
      >
        <div className="mt-14 lg:mt-16">
          <GridReadout />
        </div>

        <p className="text-meta mx-auto mt-8 max-w-3xl text-center">
          Resize the window and the four figures above change. They are read off the live grid, not written down.
        </p>
      </MarketingSection>

      <MarketingSection
        description="Five boundaries, and nothing else. A layout that needs a sixth is the wrong layout."
        title="What changes, and where"
      >
        <div className="mt-14 overflow-x-auto rounded-card border border-border bg-card lg:mt-16">
          <table className="w-full min-w-[42rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-eyebrow px-5 py-3.5 text-left font-medium">variant</th>

                <th className="text-eyebrow px-5 py-3.5 text-left font-medium">from</th>

                <th className="text-eyebrow px-5 py-3.5 text-left font-medium">page gutter</th>

                <th className="text-eyebrow px-5 py-3.5 text-left font-medium">column gap</th>

                <th className="text-eyebrow px-5 py-3.5 text-left font-medium">navigation</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {BREAKPOINTS.map((row) => (
                <tr key={row.name}>
                  <td className="px-5 py-3.5 font-mono">{row.name}</td>

                  <td className="px-5 py-3.5 font-mono text-muted-foreground">{row.min}</td>

                  <td className="px-5 py-3.5 font-mono text-muted-foreground">{row.gutter}</td>

                  <td className="px-5 py-3.5 font-mono text-muted-foreground">{row.gap}</td>

                  <td className="px-5 py-3.5 text-muted-foreground">{row.nav}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-meta mx-auto mt-8 max-w-3xl text-center">
          The navigation boundary is 56rem rather than a Tailwind default because the public menu runs out of room
          before md does. It is declared once as --breakpoint-nav and a convention test fails if a page hard-codes it.
        </p>
      </MarketingSection>

      <MarketingSection
        description="Neither display size is a round number. Both are straight lines fitted through measured points, so the headline keeps moving across phone and tablet widths instead of sitting on its minimum."
        title="The type ladder across widths"
      >
        <div className="mt-14 overflow-x-auto rounded-card border border-border bg-card lg:mt-16">
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-eyebrow px-5 py-3.5 text-left font-medium">role</th>

                <th className="text-eyebrow px-5 py-3.5 text-left font-medium">375</th>

                <th className="text-eyebrow px-5 py-3.5 text-left font-medium">768</th>

                <th className="text-eyebrow px-5 py-3.5 text-left font-medium">1440</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {TYPE_LADDER.map((row) => (
                <tr key={row.role}>
                  <td className="px-5 py-3.5 font-mono">{row.role}</td>

                  <td className="px-5 py-3.5 font-mono text-muted-foreground">{row.at375}</td>

                  <td className="px-5 py-3.5 font-mono text-muted-foreground">{row.at768}</td>

                  <td className="px-5 py-3.5 font-mono text-muted-foreground">{row.at1440}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-meta mx-auto mt-8 max-w-3xl text-center">
          Section headings pass through 37.9px at 768 and 48px at 1440 because that is what the reference site renders
          at those widths. The values in the stylesheet are the fitted line, not these three samples.
        </p>
      </MarketingSection>

      <MarketingSection
        description="Every pattern collapses at a stated width. A pattern with no entry here has not been checked, which is the same as being broken."
        title="Where each pattern collapses"
      >
        <div className="mt-14 overflow-hidden rounded-card border border-border bg-card lg:mt-16">
          <ul className="divide-y divide-border">
            {COLLAPSE.map((row) => (
              <li key={row.pattern} className="flex flex-col gap-1 px-5 py-4 md:flex-row md:items-baseline md:gap-6">
                <span className="w-64 shrink-0 text-sm font-medium">{row.pattern}</span>

                <code className="text-meta w-64 shrink-0 font-mono">{row.rule}</code>

                <span className="text-meta">at {row.at}</span>
              </li>
            ))}
          </ul>
        </div>
      </MarketingSection>
    </>
  );
}
