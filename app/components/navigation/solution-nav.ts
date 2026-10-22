import type { useTranslations } from "next-intl";
import type { PublicNavLink, PublicNavSection } from "./public-navbar-menu";

import {
  BriefcaseBusiness,
  Laptop,
  Megaphone,
  Presentation,
  Rocket,
  Store,
  TrendingUp,
  Users,
  UsersRound,
} from "lucide-react";

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
      return { icon: TrendingUp };
    case "linkedin-crm":
      return { mark: { kind: "channel", provider: "linkedin" } };
    case "whatsapp-crm":
      return { mark: { kind: "channel", provider: "whatsapp" } };
  }
}

export function solutionNavPreview(solution: SolutionCatalogEntry, locale: string) {
  const pair = solutionCapturePair(solutionCaptureManifest as SolutionCaptureManifest, solution.id, locale);
  return pair ? { dark: pair.dark.nav, light: pair.light.nav } : undefined;
}

export function solutionNavSections(t: Translate): PublicNavSection[] {
  return [
    { id: "team", title: t("NavigationBar.public.byTeam") },
    { id: "workflow", title: t("NavigationBar.public.byWorkflow") },
    { id: "more" },
  ];
}

export function solutionNavLinks(t: Translate, locale: string): PublicNavLink[] {
  const solutions = SOLUTION_CATALOG.filter((solution) => isMarketingPathPublished(locale, solution.landingPath));
  const links = solutions.map(
    (solution) =>
      ({
        ...solutionNavVisual(solution.id),
        href: solution.landingPath,
        preview: solutionNavPreview(solution, locale),
        section: solution.group,
        title: solutionNavTitle(t, solution.id),
      }) as PublicNavLink,
  );

  if (isMarketingPathPublished(locale, PROFESSIONAL_SERVICES_PATH)) {
    links.push({
      href: PROFESSIONAL_SERVICES_PATH,
      icon: BriefcaseBusiness,
      section: "more",
      title: t("NavigationBar.public.professionalServices"),
    });
  }

  links.push({
    href: SOLUTIONS_HUB_PATH,
    icon: UsersRound,
    section: "more",
    title: t("NavigationBar.public.allSolutions"),
  });

  return links;
}
