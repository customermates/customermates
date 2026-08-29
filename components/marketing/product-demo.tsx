"use client";

import { useLocale } from "next-intl";

import { BrowserFrame } from "./browser-frame";
import { type ContentLocale, contentLocaleOrDefault } from "@/i18n/locale-registry";

export const PRODUCT_DEMO_PATHS = ["/dashboard", "/inbox", "/deals"] as const;

export type ProductDemoPath = (typeof PRODUCT_DEMO_PATHS)[number];

type DemoCopy = {
  eyebrow: string;
  fallback: string;
  guideLabel: string;
  guidedTasks: Record<ProductDemoPath, readonly string[]>;
  standardDisclosure: string;
  hostedDisclosure: string;
  titles: Record<ProductDemoPath, string>;
};

const COPY = {
  en: {
    eyebrow: "Explore the product",
    fallback: "The embedded demo is taking longer than expected. Open it in a new tab to keep exploring.",
    guideLabel: "Try these three things",
    guidedTasks: {
      "/dashboard": ["Scan the seeded overview", "Open a core CRM record", "Check how the workspace is organized"],
      "/deals": ["Review the pipeline stages", "Open one seeded deal", "Compare total and weighted value"],
      "/inbox": ["Open a seeded conversation", "Check its participant context", "Compare the connected channels"],
    },
    standardDisclosure:
      "Public, seeded product demo. It uses synthetic sample data; no customer account or customer data is shown. When Mate is enabled for this demo environment, it starts closed so the CRM workflow stays unobstructed.",
    hostedDisclosure:
      "Public, seeded demo of hosted Customermates. It uses synthetic sample data; no customer account or customer data is shown. When Mate is enabled for this demo environment, it starts closed. This illustrates the managed product UI, not a self-hosted deployment.",
    titles: {
      "/dashboard": "Customermates dashboard with synthetic sample data",
      "/deals": "Customermates deal pipeline with synthetic sample data",
      "/inbox": "Customermates unified inbox with synthetic sample data",
    },
  },
  de: {
    eyebrow: "Produkt kennenlernen",
    fallback: "Die eingebettete Demo braucht länger als erwartet. Öffne sie in einem neuen Tab, um weiterzumachen.",
    guideLabel: "Probiere diese drei Schritte",
    guidedTasks: {
      "/dashboard": ["Verschaffe dir einen Überblick", "Öffne einen CRM-Datensatz", "Prüfe den Aufbau des Workspaces"],
      "/deals": ["Prüfe die Pipeline-Phasen", "Öffne einen Beispiel-Deal", "Vergleiche Gesamt- und gewichteten Wert"],
      "/inbox": [
        "Öffne eine Beispiel-Konversation",
        "Prüfe den Teilnehmerkontext",
        "Vergleiche die verbundenen Kanäle",
      ],
    },
    standardDisclosure:
      "Öffentliche, vorbefüllte Produktdemo mit synthetischen Beispieldaten. Es werden weder ein Kundenkonto noch Kundendaten angezeigt. Wenn Mate für diese Demo-Umgebung aktiviert ist, startet es geschlossen, damit der CRM-Ablauf frei bleibt.",
    hostedDisclosure:
      "Öffentliche, vorbefüllte Demo der gehosteten Customermates-Version mit synthetischen Beispieldaten. Es werden weder ein Kundenkonto noch Kundendaten angezeigt. Wenn Mate für diese Demo-Umgebung aktiviert ist, startet es geschlossen. Die Demo zeigt die Managed-Cloud-Oberfläche, kein Self-Hosted-Deployment.",
    titles: {
      "/dashboard": "Customermates-Dashboard mit synthetischen Beispieldaten",
      "/deals": "Customermates-Deal-Pipeline mit synthetischen Beispieldaten",
      "/inbox": "Einheitlicher Customermates-Posteingang mit synthetischen Beispieldaten",
    },
  },
} as const satisfies Record<ContentLocale, DemoCopy>;

function isProductDemoPath(path: string): path is ProductDemoPath {
  return PRODUCT_DEMO_PATHS.some((candidate) => candidate === path);
}

export function buildProductDemoUrl(locale: ContentLocale, path: string): string {
  if (!isProductDemoPath(path)) throw new Error(`Unsupported product demo path: ${path}`);

  return `https://demo.customermates.com/${locale}${path}?agentChat=closed`;
}

type Props = {
  hostedBoundary?: boolean;
  path: ProductDemoPath;
};

export function ProductDemo({ hostedBoundary = false, path }: Props) {
  const locale = contentLocaleOrDefault(useLocale());
  const copy = COPY[locale];
  const disclosure = hostedBoundary ? copy.hostedDisclosure : copy.standardDisclosure;

  return (
    <figure className="not-prose my-12" data-product-demo={path}>
      <figcaption className="mb-5 grid gap-5 border-y border-border py-5 sm:grid-cols-[minmax(0,1fr)_minmax(16rem,.75fr)] sm:items-start">
        <span className="block max-w-2xl">
          <span className="text-eyebrow block">{copy.eyebrow}</span>

          <span className="mt-2 block text-sm leading-6 text-muted-foreground">{disclosure}</span>
        </span>

        <span className="block">
          <span className="text-meta block">{copy.guideLabel}</span>

          <span className="mt-2 grid gap-1.5">
            {copy.guidedTasks[path].map((task, index) => (
              <span key={task} className="flex items-start gap-2 text-xs leading-5 text-foreground/80">
                <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-primary/10 text-[9px] font-medium text-primary">
                  {index + 1}
                </span>

                {task}
              </span>
            ))}
          </span>
        </span>
      </figcaption>

      <BrowserFrame
        fallbackMessage={copy.fallback}
        size="article"
        src={buildProductDemoUrl(locale, path)}
        title={copy.titles[path]}
      />
    </figure>
  );
}
