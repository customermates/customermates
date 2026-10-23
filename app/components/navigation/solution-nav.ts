import type { useTranslations } from "next-intl";
import type { PublicNavLink, PublicNavSection } from "./public-navbar-menu";

import {
  BriefcaseBusiness,
  Compass,
  SquareKanban,
  Laptop,
  Megaphone,
  Presentation,
  Rocket,
  Store,
  Users,
} from "lucide-react";

import { PUBLIC_DEMO_ORIGIN, demoWorkspacePath } from "@/components/marketing/product-demo-src";
import solutionCaptureManifest from "@/core/solutions/solution-capture-manifest.json";
import { type SolutionCaptureManifest, solutionCapturePair } from "@/core/solutions/solution-captures";
import { SOLUTION_CATALOG, type SolutionCatalogEntry, type SolutionId } from "@/core/solutions/solution-catalog";
import { isMarketingPathPublished } from "@/i18n/locale-registry";

type Translate = ReturnType<typeof useTranslations>;

export const PROFESSIONAL_SERVICES_PATH = "/for/professional-services";

export const SOLUTIONS_HUB_PATH = "/for";

function solutionNavTitle(t: Translate, id: SolutionId): string {
  switch (id) {
    case "smb":
      return t("NavigationBar.public.smallBusiness");
    case "consultants":
      return t("NavigationBar.public.consultants");
    case "agencies":
      return t("NavigationBar.public.agencies");
    case "freelancers":
      return t("NavigationBar.public.freelancers");
    case "startups":
      return t("NavigationBar.public.startups");
    case "client-management":
      return t("NavigationBar.public.clientManagement");
    case "sales-pipeline":
      return t("NavigationBar.public.pipeline");
    case "linkedin-crm":
      return t("NavigationBar.public.linkedinCrm");
    case "whatsapp-crm":
      return t("NavigationBar.public.whatsappCrm");
  }
}

function solutionNavVisual(id: SolutionId): Pick<PublicNavLink, "icon" | "mark"> {
  switch (id) {
    case "smb":
      return { icon: Store };
    case "consultants":
      return { icon: Presentation };
    case "agencies":
      return { icon: Megaphone };
    case "freelancers":
      return { icon: Laptop };
    case "startups":
      return { icon: Rocket };
    case "client-management":
      return { icon: Users };
    case "sales-pipeline":
      return { icon: SquareKanban };
    case "linkedin-crm":
      return { mark: { kind: "channel", muted: true, provider: "linkedin" } };
    case "whatsapp-crm":
      return { mark: { kind: "channel", muted: true, provider: "whatsapp" } };
  }
}

function solutionNavSummary(t: Translate, id: SolutionId): string {
  switch (id) {
    case "smb":
      return t("NavigationBar.public.solutionSummaries.smallBusiness");
    case "consultants":
      return t("NavigationBar.public.solutionSummaries.consultants");
    case "agencies":
      return t("NavigationBar.public.solutionSummaries.agencies");
    case "freelancers":
      return t("NavigationBar.public.solutionSummaries.freelancers");
    case "startups":
      return t("NavigationBar.public.solutionSummaries.startups");
    case "client-management":
      return t("NavigationBar.public.solutionSummaries.clientManagement");
    case "sales-pipeline":
      return t("NavigationBar.public.solutionSummaries.salesPipeline");
    case "linkedin-crm":
      return t("NavigationBar.public.solutionSummaries.linkedinCrm");
    case "whatsapp-crm":
      return t("NavigationBar.public.solutionSummaries.whatsappCrm");
  }
}

export function solutionExampleWorkspaceHref(solution: SolutionCatalogEntry, locale: string): string {
  return `${PUBLIC_DEMO_ORIGIN}${demoWorkspacePath(locale, "/dashboard", solution.id)}`;
}

export function solutionNavPreview(t: Translate, solution: SolutionCatalogEntry, locale: string) {
  const pair = solutionCapturePair(solutionCaptureManifest as SolutionCaptureManifest, solution.id, locale);
  if (!pair) return undefined;
  return {
    dark: pair.dark.nav,
    description: solutionNavSummary(t, solution.id),
    exampleHref: solutionExampleWorkspaceHref(solution, locale),
    exampleLabel: t("NavigationBar.public.openExampleWorkspace"),
    light: pair.light.nav,
  };
}

export function solutionNavSections(t: Translate): PublicNavSection[] {
  return [
    { id: "team", title: t("NavigationBar.public.byTeam") },
    { id: "workflow", title: t("NavigationBar.public.byWorkflow") },
  ];
}

export function solutionNavLinks(t: Translate, locale: string): PublicNavLink[] {
  const solutions = SOLUTION_CATALOG.filter((solution) => isMarketingPathPublished(locale, solution.landingPath));
  const links = solutions.map(
    (solution) =>
      ({
        ...solutionNavVisual(solution.id),
        href: solution.landingPath,
        preview: solutionNavPreview(t, solution, locale),
        section: solution.group,
        title: solutionNavTitle(t, solution.id),
      }) as PublicNavLink,
  );

  if (isMarketingPathPublished(locale, PROFESSIONAL_SERVICES_PATH)) {
    links.push({
      footer: true,
      href: PROFESSIONAL_SERVICES_PATH,
      icon: BriefcaseBusiness,
      section: "team",
      title: t("NavigationBar.public.professionalServices"),
    });
  }

  links.push({
    footer: true,
    href: SOLUTIONS_HUB_PATH,
    icon: Compass,
    section: "workflow",
    title: t("NavigationBar.public.allSolutions"),
  });

  return links;
}
