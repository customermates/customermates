"use client";

import { useLocale } from "next-intl";

import { BrowserFrame } from "./browser-frame";
import { cn } from "@/core/utils/cn";
import { type ContentLocale, contentLocaleOrDefault } from "@/i18n/locale-registry";

export const PRODUCT_DEMO_PATHS = [
  "/dashboard",
  "/inbox",
  "/deals",
  "/contacts",
  "/organizations",
  "/tasks",
  "/profile/api-keys",
  "/profile/connected-accounts",
  "/company/webhooks",
] as const;

export type ProductDemoPath = (typeof PRODUCT_DEMO_PATHS)[number];
export type ProductDemoPresentation = "article" | "standalone";

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
      "/contacts": ["Scan the contact list", "Open one seeded contact", "Review its linked CRM context"],
      "/deals": ["Review the pipeline stages", "Open one seeded deal", "Compare total and weighted value"],
      "/inbox": ["Open a seeded conversation", "Check its participant context", "Compare the connected channels"],
      "/organizations": ["Scan the account list", "Open one seeded organization", "Review its linked records"],
      "/tasks": ["Switch between task views", "Open one seeded task", "Review its owner and linked records"],
      "/profile/api-keys": [
        "Review the API-key controls",
        "Check how a key is created",
        "Review key status and access",
      ],
      "/profile/connected-accounts": [
        "Review the available providers",
        "Open one connected account",
        "Check its sharing and sync state",
      ],
      "/company/webhooks": [
        "Review the configured endpoints",
        "Open the create-webhook flow",
        "Inspect the available event choices",
      ],
    },
    standardDisclosure:
      "Public, seeded product demo. It uses synthetic sample data; no customer account or customer data is shown. When Mate is enabled for this demo environment, it starts closed so the CRM workflow stays unobstructed.",
    hostedDisclosure:
      "Public, seeded demo of hosted Customermates. It uses synthetic sample data; no customer account or customer data is shown. When Mate is enabled for this demo environment, it starts closed. This illustrates the managed product UI, not a self-hosted deployment.",
    titles: {
      "/dashboard": "Customermates dashboard with synthetic sample data",
      "/contacts": "Customermates contact list with synthetic sample data",
      "/deals": "Customermates deal pipeline with synthetic sample data",
      "/inbox": "Customermates unified inbox with synthetic sample data",
      "/organizations": "Customermates organization list with synthetic sample data",
      "/tasks": "Customermates task workspace with synthetic sample data",
      "/profile/api-keys": "Customermates API-key settings with synthetic sample data",
      "/profile/connected-accounts": "Customermates connected-account settings with synthetic sample data",
      "/company/webhooks": "Customermates webhook settings with synthetic sample data",
    },
  },
  de: {
    eyebrow: "Produkt kennenlernen",
    fallback:
      "Die eingebettete Demo braucht länger als erwartet. Öffnen Sie sie in einem neuen Tab, um weiterzumachen.",
    guideLabel: "Probieren Sie diese drei Schritte",
    guidedTasks: {
      "/dashboard": [
        "Verschaffen Sie sich einen Überblick",
        "Öffnen Sie einen CRM-Datensatz",
        "Prüfen Sie den Aufbau des Workspaces",
      ],
      "/contacts": [
        "Prüfen Sie die Kontaktliste",
        "Öffnen Sie einen Beispielkontakt",
        "Prüfen Sie den verknüpften CRM-Kontext",
      ],
      "/deals": [
        "Prüfen Sie die Pipeline-Phasen",
        "Öffnen Sie einen Beispiel-Deal",
        "Vergleichen Sie Gesamt- und gewichteten Wert",
      ],
      "/inbox": [
        "Öffnen Sie eine Beispiel-Konversation",
        "Prüfen Sie den Teilnehmerkontext",
        "Vergleichen Sie die verbundenen Kanäle",
      ],
      "/organizations": [
        "Prüfen Sie die Unternehmensliste",
        "Öffnen Sie ein Beispielunternehmen",
        "Prüfen Sie die verknüpften Datensätze",
      ],
      "/tasks": [
        "Wechseln Sie zwischen den Aufgabenansichten",
        "Öffnen Sie eine Beispielaufgabe",
        "Prüfen Sie Verantwortliche und Verknüpfungen",
      ],
      "/profile/api-keys": [
        "Prüfen Sie die API-Key-Verwaltung",
        "Öffnen Sie den Erstellungsablauf",
        "Prüfen Sie Status und Zugriff",
      ],
      "/profile/connected-accounts": [
        "Prüfen Sie die verfügbaren Anbieter",
        "Öffnen Sie ein verbundenes Konto",
        "Prüfen Sie Freigabe und Synchronisierung",
      ],
      "/company/webhooks": [
        "Prüfen Sie die konfigurierten Endpunkte",
        "Öffnen Sie den Webhook-Dialog",
        "Prüfen Sie die verfügbaren Ereignisse",
      ],
    },
    standardDisclosure:
      "Öffentliche, vorbefüllte Produktdemo mit synthetischen Beispieldaten. Es werden weder ein Kundenkonto noch Kundendaten angezeigt. Wenn Mate für diese Demo-Umgebung aktiviert ist, startet es geschlossen, damit der CRM-Ablauf frei bleibt.",
    hostedDisclosure:
      "Öffentliche, vorbefüllte Demo der gehosteten Customermates-Version mit synthetischen Beispieldaten. Es werden weder ein Kundenkonto noch Kundendaten angezeigt. Wenn Mate für diese Demo-Umgebung aktiviert ist, startet es geschlossen. Die Demo zeigt die Managed-Cloud-Oberfläche, kein Self-Hosted-Deployment.",
    titles: {
      "/dashboard": "Customermates-Dashboard mit synthetischen Beispieldaten",
      "/contacts": "Customermates-Kontaktliste mit synthetischen Beispieldaten",
      "/deals": "Customermates-Deal-Pipeline mit synthetischen Beispieldaten",
      "/inbox": "Einheitlicher Customermates-Posteingang mit synthetischen Beispieldaten",
      "/organizations": "Customermates-Unternehmensliste mit synthetischen Beispieldaten",
      "/tasks": "Customermates-Aufgabenbereich mit synthetischen Beispieldaten",
      "/profile/api-keys": "Customermates-API-Key-Einstellungen mit synthetischen Beispieldaten",
      "/profile/connected-accounts": "Einstellungen für verbundene Customermates-Konten mit Beispieldaten",
      "/company/webhooks": "Customermates-Webhook-Einstellungen mit synthetischen Beispieldaten",
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
  presentation?: ProductDemoPresentation;
};

export function ProductDemo({ hostedBoundary = false, path, presentation = "article" }: Props) {
  const locale = contentLocaleOrDefault(useLocale());
  const copy = COPY[locale];
  const disclosure = hostedBoundary ? copy.hostedDisclosure : copy.standardDisclosure;

  return (
    <figure
      className={cn("not-prose", presentation === "article" ? "my-12" : "my-0")}
      data-product-demo={path}
      data-product-demo-presentation={presentation}
    >
      <figcaption
        className={cn(
          "mb-5 grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(16rem,.75fr)] sm:items-start",
          presentation === "article" && "border-y border-border py-5",
        )}
      >
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
        size={presentation === "standalone" ? "full" : "article"}
        src={buildProductDemoUrl(locale, path)}
        title={copy.titles[path]}
      />
    </figure>
  );
}
