import { useLocale } from "next-intl";

import { type BrowserFramePoster, BrowserFrame } from "./browser-frame";
import {
  DEMO_RECORD_LIST_PATHS,
  PUBLIC_DEMO_ORIGIN,
  demoWorkspacePath,
  demoWorkspaceSlug,
  localProductDemoSrc,
} from "./product-demo-src";
import { cn } from "@/core/utils/cn";
import { env } from "@/env";
import { type ContentLocale, appLocaleOrDefault, contentLocaleOrDefault } from "@/i18n/locale-registry";
import solutionCaptureManifest from "@/core/solutions/solution-capture-manifest.json";
import { type SolutionCaptureManifest, solutionCapturePair } from "@/core/solutions/solution-captures";
import type { SolutionId } from "@/core/solutions/solution-catalog";

export { DEMO_RECORD_LIST_PATHS, DEMO_RECORD_TYPE_IDS } from "./product-demo-src";

export const PRODUCT_DEMO_PATHS = [
  "/dashboard",
  "/inbox",
  DEMO_RECORD_LIST_PATHS.deals,
  DEMO_RECORD_LIST_PATHS.contacts,
  DEMO_RECORD_LIST_PATHS.organizations,
  DEMO_RECORD_LIST_PATHS.tasks,
  "/settings/api-keys",
  "/settings/channels",
  "/settings/webhooks",
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
      [DEMO_RECORD_LIST_PATHS.contacts]: [
        "Scan the contact list",
        "Open one seeded contact",
        "Review its linked CRM context",
      ],
      [DEMO_RECORD_LIST_PATHS.deals]: [
        "Review the pipeline stages",
        "Open one seeded deal",
        "Compare total and weighted value",
      ],
      "/inbox": ["Open a seeded conversation", "Check its participant context", "Compare the connected channels"],
      [DEMO_RECORD_LIST_PATHS.organizations]: [
        "Scan the account list",
        "Open one seeded organization",
        "Review its linked records",
      ],
      [DEMO_RECORD_LIST_PATHS.tasks]: [
        "Switch between task views",
        "Open one seeded task",
        "Review its owner and linked records",
      ],
      "/settings/api-keys": [
        "Review the API-key controls",
        "Check how a key is created",
        "Review key status and access",
      ],
      "/settings/channels": [
        "Review the available providers",
        "Open one connected account",
        "Check its sharing and sync state",
      ],
      "/settings/webhooks": [
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
      [DEMO_RECORD_LIST_PATHS.contacts]: "Customermates contact list with synthetic sample data",
      [DEMO_RECORD_LIST_PATHS.deals]: "Customermates deal pipeline with synthetic sample data",
      "/inbox": "Customermates unified inbox with synthetic sample data",
      [DEMO_RECORD_LIST_PATHS.organizations]: "Customermates organization list with synthetic sample data",
      [DEMO_RECORD_LIST_PATHS.tasks]: "Customermates task workspace with synthetic sample data",
      "/settings/api-keys": "Customermates API-key settings with synthetic sample data",
      "/settings/channels": "Customermates connected-account settings with synthetic sample data",
      "/settings/webhooks": "Customermates webhook settings with synthetic sample data",
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
      [DEMO_RECORD_LIST_PATHS.contacts]: [
        "Prüfen Sie die Kontaktliste",
        "Öffnen Sie einen Beispielkontakt",
        "Prüfen Sie den verknüpften CRM-Kontext",
      ],
      [DEMO_RECORD_LIST_PATHS.deals]: [
        "Prüfen Sie die Pipeline-Phasen",
        "Öffnen Sie einen Beispiel-Deal",
        "Vergleichen Sie Gesamt- und gewichteten Wert",
      ],
      "/inbox": [
        "Öffnen Sie eine Beispiel-Konversation",
        "Prüfen Sie den Teilnehmerkontext",
        "Vergleichen Sie die verbundenen Kanäle",
      ],
      [DEMO_RECORD_LIST_PATHS.organizations]: [
        "Prüfen Sie die Unternehmensliste",
        "Öffnen Sie ein Beispielunternehmen",
        "Prüfen Sie die verknüpften Datensätze",
      ],
      [DEMO_RECORD_LIST_PATHS.tasks]: [
        "Wechseln Sie zwischen den Aufgabenansichten",
        "Öffnen Sie eine Beispielaufgabe",
        "Prüfen Sie Verantwortliche und Verknüpfungen",
      ],
      "/settings/api-keys": [
        "Prüfen Sie die API-Key-Verwaltung",
        "Öffnen Sie den Erstellungsablauf",
        "Prüfen Sie Status und Zugriff",
      ],
      "/settings/channels": [
        "Prüfen Sie die verfügbaren Anbieter",
        "Öffnen Sie ein verbundenes Konto",
        "Prüfen Sie Freigabe und Synchronisierung",
      ],
      "/settings/webhooks": [
        "Prüfen Sie die konfigurierten Endpunkte",
        "Öffnen Sie den Webhook-Dialog",
        "Prüfen Sie die verfügbaren Ereignisse",
      ],
    },
    standardDisclosure:
      "Öffentliche, vorbefüllte Produktdemo mit synthetischen Beispieldaten. Es werden weder ein Kundenkonto noch Kundendaten angezeigt. Ist Mate in dieser Demo aktiviert, bleibt das Mate-Fenster anfangs geschlossen, damit das CRM frei sichtbar ist.",
    hostedDisclosure:
      "Öffentliche, vorbefüllte Demo der gehosteten Customermates-Version mit synthetischen Beispieldaten. Es werden weder ein Kundenkonto noch Kundendaten angezeigt. Ist Mate in dieser Demo aktiviert, bleibt das Mate-Fenster anfangs geschlossen. Die Demo zeigt die Oberfläche der verwalteten Cloud, keine selbst gehostete Installation.",
    titles: {
      "/dashboard": "Customermates-Dashboard mit synthetischen Beispieldaten",
      [DEMO_RECORD_LIST_PATHS.contacts]: "Customermates-Kontaktliste mit synthetischen Beispieldaten",
      [DEMO_RECORD_LIST_PATHS.deals]: "Customermates-Deal-Pipeline mit synthetischen Beispieldaten",
      "/inbox": "Einheitlicher Customermates-Posteingang mit synthetischen Beispieldaten",
      [DEMO_RECORD_LIST_PATHS.organizations]: "Customermates-Unternehmensliste mit synthetischen Beispieldaten",
      [DEMO_RECORD_LIST_PATHS.tasks]: "Customermates-Aufgabenbereich mit synthetischen Beispieldaten",
      "/settings/api-keys": "Customermates-API-Key-Einstellungen mit synthetischen Beispieldaten",
      "/settings/channels": "Einstellungen für verbundene Customermates-Konten mit Beispieldaten",
      "/settings/webhooks": "Customermates-Webhook-Einstellungen mit synthetischen Beispieldaten",
    },
  },
  fr: {
    eyebrow: "Découvrir le produit",
    fallback: "La démo intégrée met plus de temps que prévu à charger. Ouvrez-la dans un nouvel onglet pour continuer.",
    guideLabel: "Essayez ces trois choses",
    guidedTasks: {
      "/dashboard": [
        "Parcourez la vue d'ensemble préremplie",
        "Ouvrez un enregistrement du CRM",
        "Voyez comment l'espace de travail est organisé",
      ],
      [DEMO_RECORD_LIST_PATHS.contacts]: [
        "Parcourez la liste des contacts",
        "Ouvrez un contact d'exemple",
        "Consultez son contexte CRM lié",
      ],
      [DEMO_RECORD_LIST_PATHS.deals]: [
        "Passez en revue les étapes du pipeline",
        "Ouvrez une affaire d'exemple",
        "Comparez la valeur totale et la valeur pondérée",
      ],
      "/inbox": [
        "Ouvrez une conversation d'exemple",
        "Consultez le contexte des participants",
        "Comparez les canaux connectés",
      ],
      [DEMO_RECORD_LIST_PATHS.organizations]: [
        "Parcourez la liste des organisations",
        "Ouvrez une organisation d'exemple",
        "Consultez ses enregistrements liés",
      ],
      [DEMO_RECORD_LIST_PATHS.tasks]: [
        "Passez d'une vue des tâches à l'autre",
        "Ouvrez une tâche d'exemple",
        "Consultez son responsable et ses enregistrements liés",
      ],
      "/settings/api-keys": [
        "Passez en revue la gestion des clés API",
        "Voyez comment une clé est créée",
        "Consultez le statut et les accès d'une clé",
      ],
      "/settings/channels": [
        "Passez en revue les fournisseurs disponibles",
        "Ouvrez un compte connecté",
        "Consultez son partage et sa synchronisation",
      ],
      "/settings/webhooks": [
        "Passez en revue les points de terminaison configurés",
        "Ouvrez la création d'un webhook",
        "Examinez les événements disponibles",
      ],
    },
    standardDisclosure:
      "Démo publique et préremplie du produit, avec des données d'exemple synthétiques en anglais ; aucun compte ni aucune donnée client n'est affiché. Si Mate est activé dans cet environnement de démo, sa fenêtre reste d'abord fermée pour laisser le CRM bien visible.",
    hostedDisclosure:
      "Démo publique et préremplie de la version hébergée de Customermates, avec des données d'exemple synthétiques en anglais ; aucun compte ni aucune donnée client n'est affiché. Si Mate est activé dans cet environnement de démo, sa fenêtre reste d'abord fermée. La démo montre l'interface du cloud géré, pas une installation auto-hébergée.",
    titles: {
      "/dashboard": "Tableau de bord Customermates avec des données d'exemple synthétiques",
      [DEMO_RECORD_LIST_PATHS.contacts]: "Liste de contacts Customermates avec des données d'exemple synthétiques",
      [DEMO_RECORD_LIST_PATHS.deals]: "Pipeline d'affaires Customermates avec des données d'exemple synthétiques",
      "/inbox": "Boîte de réception unifiée Customermates avec des données d'exemple synthétiques",
      [DEMO_RECORD_LIST_PATHS.organizations]:
        "Liste d'organisations Customermates avec des données d'exemple synthétiques",
      [DEMO_RECORD_LIST_PATHS.tasks]: "Espace des tâches Customermates avec des données d'exemple synthétiques",
      "/settings/api-keys": "Paramètres des clés API Customermates avec des données d'exemple synthétiques",
      "/settings/channels": "Paramètres des comptes connectés Customermates avec des données d'exemple",
      "/settings/webhooks": "Paramètres des webhooks Customermates avec des données d'exemple synthétiques",
    },
  },
} as const satisfies Record<ContentLocale, DemoCopy>;

function isProductDemoPath(path: string): path is ProductDemoPath {
  return PRODUCT_DEMO_PATHS.some((candidate) => candidate === path);
}

export function productDemoPath(path: string): ProductDemoPath {
  if (!isProductDemoPath(path)) throw new Error(`Unsupported product demo path: ${path}`);
  return path;
}

export function buildProductDemoUrl(locale: string, path: string, solutionId?: SolutionId): string {
  const demoPath = productDemoPath(path);
  const query = demoPath === "/inbox" ? "threadId=latest&agentChat=closed" : "agentChat=closed";

  return `${PUBLIC_DEMO_ORIGIN}${demoWorkspacePath(locale, demoPath, solutionId)}?${query}`;
}

export function solutionDemoWorkspaceSlug(solutionId: SolutionId, uiLocale: string): string {
  return demoWorkspaceSlug(uiLocale, solutionId);
}

export function solutionDemoPoster(solutionId: SolutionId, pageLocale: string): BrowserFramePoster | undefined {
  const pair = solutionCapturePair(solutionCaptureManifest as SolutionCaptureManifest, solutionId, pageLocale);
  return pair ? { dark: pair.dark.main, light: pair.light.main } : undefined;
}

type Props = {
  hostedBoundary?: boolean;
  path: ProductDemoPath;
  presentation?: ProductDemoPresentation;
  solutionId?: SolutionId;
};

export function ProductDemo({ hostedBoundary = false, path, presentation = "article", solutionId }: Props) {
  const uiLocale = appLocaleOrDefault(useLocale());
  const locale: ContentLocale = contentLocaleOrDefault(uiLocale);
  const copy = COPY[locale];
  const poster = solutionId ? solutionDemoPoster(solutionId, uiLocale) : undefined;
  const disclosure = hostedBoundary ? copy.hostedDisclosure : copy.standardDisclosure;

  return (
    <figure
      className={cn("not-prose mx-auto w-full max-w-live-preview", presentation === "article" ? "my-12" : "my-0")}
      data-product-demo={path}
      data-product-demo-presentation={presentation}
      data-product-demo-solution={solutionId}
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
        embed={env.APP_MODE !== "self-hosted"}
        fallbackMessage={copy.fallback}
        poster={poster}
        src={localProductDemoSrc(buildProductDemoUrl(uiLocale, path, solutionId))}
        title={copy.titles[path]}
      />
    </figure>
  );
}
