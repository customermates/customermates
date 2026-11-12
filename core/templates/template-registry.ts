import type { Capability } from "@/core/capabilities/capabilities";
import type { TemplateBundle, TemplateLocale, TemplateSpec } from "./template-spec.schema";
import type { TemplateSlug } from "./template-slugs";

import { SHIPPED_CAPABILITIES } from "@/core/capabilities/capabilities";
import { DEFAULT_LOCALE } from "@/i18n/locale-registry";

import actionItemTracker from "./bundles/action-item-tracker.json";
import agencyClientPipeline from "./bundles/agency-client-pipeline.json";
import applicantTracking from "./bundles/applicant-tracking.json";
import bookingPage from "./bundles/booking-page.json";
import clientIntake from "./bundles/client-intake.json";
import clientSupportDesk from "./bundles/client-support-desk.json";
import clientTracker from "./bundles/client-tracker.json";
import consultantEngagements from "./bundles/consultant-engagements.json";
import contentCalendar from "./bundles/content-calendar.json";
import creativeBookings from "./bundles/creative-bookings.json";
import customCrm from "./bundles/custom-crm.json";
import formToCrm from "./bundles/form-to-crm.json";
import founderSalesPipeline from "./bundles/founder-sales-pipeline.json";
import insuranceBrokerPipeline from "./bundles/insurance-broker-pipeline.json";
import lawFirmIntake from "./bundles/law-firm-intake.json";
import nonprofitDonorsAndMembers from "./bundles/nonprofit-donors-and-members.json";
import realEstatePipeline from "./bundles/real-estate-pipeline.json";
import recruitingDesk from "./bundles/recruiting-desk.json";
import salesPipeline from "./bundles/sales-pipeline.json";
import supplierQuestionnaire from "./bundles/supplier-questionnaire.json";
import taxBookkeepingPractice from "./bundles/tax-bookkeeping-practice.json";
import teamTracker from "./bundles/team-tracker.json";
import tradesJobPipeline from "./bundles/trades-job-pipeline.json";
import vcDealFlow from "./bundles/vc-deal-flow.json";
import whatsappEnquiryFollowUp from "./bundles/whatsapp-enquiry-follow-up.json";
import { TEMPLATE_SLUGS } from "./template-slugs";

export { TEMPLATE_SLUGS, isTemplateSlug } from "./template-slugs";
export type { TemplateSlug } from "./template-slugs";

export type TemplateDeployment = "cloud" | "self-hosted";

export const CLOUD_ONLY_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>(["calendarWrite"]);

const BUNDLES: Readonly<Record<TemplateSlug, TemplateBundle>> = {
  "action-item-tracker": actionItemTracker as unknown as TemplateBundle,
  "agency-client-pipeline": agencyClientPipeline as unknown as TemplateBundle,
  "applicant-tracking": applicantTracking as unknown as TemplateBundle,
  "booking-page": bookingPage as unknown as TemplateBundle,
  "client-intake": clientIntake as unknown as TemplateBundle,
  "client-support-desk": clientSupportDesk as unknown as TemplateBundle,
  "client-tracker": clientTracker as unknown as TemplateBundle,
  "consultant-engagements": consultantEngagements as unknown as TemplateBundle,
  "content-calendar": contentCalendar as unknown as TemplateBundle,
  "creative-bookings": creativeBookings as unknown as TemplateBundle,
  "custom-crm": customCrm as unknown as TemplateBundle,
  "form-to-crm": formToCrm as unknown as TemplateBundle,
  "founder-sales-pipeline": founderSalesPipeline as unknown as TemplateBundle,
  "insurance-broker-pipeline": insuranceBrokerPipeline as unknown as TemplateBundle,
  "law-firm-intake": lawFirmIntake as unknown as TemplateBundle,
  "nonprofit-donors-and-members": nonprofitDonorsAndMembers as unknown as TemplateBundle,
  "real-estate-pipeline": realEstatePipeline as unknown as TemplateBundle,
  "recruiting-desk": recruitingDesk as unknown as TemplateBundle,
  "sales-pipeline": salesPipeline as unknown as TemplateBundle,
  "supplier-questionnaire": supplierQuestionnaire as unknown as TemplateBundle,
  "tax-bookkeeping-practice": taxBookkeepingPractice as unknown as TemplateBundle,
  "team-tracker": teamTracker as unknown as TemplateBundle,
  "trades-job-pipeline": tradesJobPipeline as unknown as TemplateBundle,
  "vc-deal-flow": vcDealFlow as unknown as TemplateBundle,
  "whatsapp-enquiry-follow-up": whatsappEnquiryFollowUp as unknown as TemplateBundle,
};

export function getTemplate(slug: TemplateSlug): TemplateSpec {
  return BUNDLES[slug].spec;
}

export function hasTemplateText(slug: TemplateSlug, locale: string): boolean {
  return BUNDLES[slug].text[locale] !== undefined;
}

export function getTemplateText(slug: TemplateSlug, locale: string): TemplateLocale {
  const text = BUNDLES[slug].text;
  const found = text[locale] ?? text[DEFAULT_LOCALE];
  if (!found) throw new Error(`Template ${slug} has no ${DEFAULT_LOCALE} text`);
  return found;
}

export function isTemplateOffered(
  slug: TemplateSlug,
  options: { deployment: TemplateDeployment; shipped?: ReadonlySet<Capability> },
): boolean {
  const shipped = options.shipped ?? SHIPPED_CAPABILITIES;
  return getTemplate(slug).requiresCapabilities.every(
    (capability) =>
      shipped.has(capability) && (options.deployment === "cloud" || !CLOUD_ONLY_CAPABILITIES.has(capability)),
  );
}

export type TemplateListing = {
  slug: TemplateSlug;
  spec: TemplateSpec;
  text: TemplateLocale;
  translated: boolean;
  status: TemplateSpec["status"][string] | null;
  publicPage: TemplateSpec["publicPage"][string] | null;
  offered: boolean;
};

export function listTemplates(options: {
  locale: string;
  publishedOnly?: boolean;
  deployment?: TemplateDeployment;
  shipped?: ReadonlySet<Capability>;
}): TemplateListing[] {
  const deployment = options.deployment ?? "cloud";
  return TEMPLATE_SLUGS.map((slug) => {
    const spec = getTemplate(slug);
    return {
      slug,
      spec,
      text: getTemplateText(slug, options.locale),
      translated: hasTemplateText(slug, options.locale),
      status: spec.status[options.locale] ?? null,
      publicPage: spec.publicPage[options.locale] ?? null,
      offered: isTemplateOffered(slug, { deployment, shipped: options.shipped }),
    };
  }).filter((listing) => !options.publishedOnly || (listing.status === "published" && listing.offered));
}
