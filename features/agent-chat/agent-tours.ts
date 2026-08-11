import { z } from "zod";
import type { AgentTranslator } from "./agent-translator";

export const AGENT_TOUR_IDS = [
  "platform",
  "dashboard",
  "contacts",
  "organizations",
  "deals",
  "services",
  "tasks",
] as const;

export const AgentTourIdSchema = z.enum(AGENT_TOUR_IDS);
export type AgentTourId = z.infer<typeof AgentTourIdSchema>;

export type AgentGuidedTourStep = {
  targetId: string;
  route: string | null;
  note: string;
};

type TourStep = Pick<AgentGuidedTourStep, "targetId" | "route"> & { noteKey: string };

const PAGE_TOUR_STEPS: Record<Exclude<AgentTourId, "platform">, readonly TourStep[]> = {
  dashboard: [
    { targetId: "nav-dashboard", route: "/dashboard", noteKey: "dashboard.nav-dashboard" },
    { targetId: "dashboard-add-widget", route: "/dashboard", noteKey: "dashboard.dashboard-add-widget" },
  ],
  contacts: [
    { targetId: "nav-contacts", route: "/contacts", noteKey: "contacts.nav-contacts" },
    { targetId: "contacts-add", route: "/contacts", noteKey: "contacts.contacts-add" },
    { targetId: "contacts-search", route: "/contacts", noteKey: "contacts.contacts-search" },
    { targetId: "contacts-filter", route: "/contacts", noteKey: "contacts.contacts-filter" },
    { targetId: "contacts-display-options", route: "/contacts", noteKey: "contacts.contacts-display-options" },
  ],
  organizations: [
    { targetId: "nav-organizations", route: "/organizations", noteKey: "organizations.nav-organizations" },
    { targetId: "organizations-add", route: "/organizations", noteKey: "organizations.organizations-add" },
    { targetId: "organizations-filter", route: "/organizations", noteKey: "organizations.organizations-filter" },
    {
      targetId: "organizations-display-options",
      route: "/organizations",
      noteKey: "organizations.organizations-display-options",
    },
  ],
  deals: [
    { targetId: "nav-deals", route: "/deals", noteKey: "deals.nav-deals" },
    { targetId: "deals-add", route: "/deals", noteKey: "deals.deals-add" },
    { targetId: "deals-filter", route: "/deals", noteKey: "deals.deals-filter" },
    { targetId: "deals-display-options", route: "/deals", noteKey: "deals.deals-display-options" },
  ],
  services: [
    { targetId: "nav-services", route: "/services", noteKey: "services.nav-services" },
    { targetId: "services-add", route: "/services", noteKey: "services.services-add" },
    { targetId: "services-filter", route: "/services", noteKey: "services.services-filter" },
    { targetId: "services-display-options", route: "/services", noteKey: "services.services-display-options" },
  ],
  tasks: [
    { targetId: "nav-tasks", route: "/tasks", noteKey: "tasks.nav-tasks" },
    { targetId: "tasks-add", route: "/tasks", noteKey: "tasks.tasks-add" },
    { targetId: "tasks-filter", route: "/tasks", noteKey: "tasks.tasks-filter" },
    { targetId: "tasks-display-options", route: "/tasks", noteKey: "tasks.tasks-display-options" },
  ],
};

const PLATFORM_TOUR_STEPS: readonly TourStep[] = [
  { targetId: "nav-dashboard", route: "/dashboard", noteKey: "platform.nav-dashboard" },
  ...PAGE_TOUR_STEPS.dashboard.slice(1),
  { targetId: "nav-inbox", route: "/inbox", noteKey: "platform.nav-inbox" },
  ...PAGE_TOUR_STEPS.contacts.slice(0, 2),
  ...PAGE_TOUR_STEPS.organizations.slice(0, 2),
  ...PAGE_TOUR_STEPS.deals.slice(0, 2),
  ...PAGE_TOUR_STEPS.tasks.slice(0, 2),
  ...PAGE_TOUR_STEPS.services.slice(0, 2),
  { targetId: "nav-search", route: null, noteKey: "platform.nav-search" },
];

export function agentGuidedTour(tourId: AgentTourId, t: AgentTranslator): AgentGuidedTourStep[] {
  const source = tourId === "platform" ? PLATFORM_TOUR_STEPS : PAGE_TOUR_STEPS[tourId];

  return source.map((step) => ({
    targetId: step.targetId,
    route: step.route,
    note: t(`AgentChat.tourSteps.${step.noteKey}`),
  }));
}
