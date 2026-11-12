import { getLocale, getTranslations } from "next-intl/server";

import { AppLink } from "@/components/shared/app-link";
import { resolveCommercialTokens } from "@/core/commercial/commercial-tokens";
import { pagePublicationOptions } from "@/core/templates/template-deployment";
import { templateSignupPath } from "@/core/templates/template-page-model";
import { templateVisibilityBySlug } from "@/core/templates/template-publication";
import { isTemplateSlug } from "@/core/templates/template-slugs";
import { templatePagePath } from "@/core/templates/templates-source";
import { formattingTagFor } from "@/i18n/locale-registry";

export const SWITCH_KIT_TOOLS = ["sheets", "notion", "airtable", "trello", "smartsheet", "clickup"] as const;

export type SwitchKitTool = (typeof SWITCH_KIT_TOOLS)[number];

export const SWITCH_KIT_TEMPLATE = "custom-crm";

export const SWITCH_KIT_CHECKED_ON = "2026-11-12";

type ToolCopy = { export: string; moves: string; name: string; replaces: string; stays: string };

export function isSwitchKitTool(value: string): value is SwitchKitTool {
  return (SWITCH_KIT_TOOLS as readonly string[]).includes(value);
}

type BlockProps = { heading?: "h2" | "h3"; locale: string; tool: SwitchKitTool };

export async function SwitchKitBlock({ heading = "h2", locale, tool }: BlockProps) {
  const t = await getTranslations("TemplatePages.switchKit");
  const Heading = heading;
  const copy = (t.raw("tools") as Record<SwitchKitTool, ToolCopy>)[tool];
  const checked = new Intl.DateTimeFormat(formattingTagFor(locale), {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(`${SWITCH_KIT_CHECKED_ON}T00:00:00Z`));
  const mapped = isTemplateSlug(SWITCH_KIT_TEMPLATE);
  const found = mapped ? templateVisibilityBySlug(SWITCH_KIT_TEMPLATE, locale, pagePublicationOptions()) : null;
  const templateVisible = found?.visibility === "own" || found?.visibility === "proof";
  const signupHref = mapped ? templateSignupPath(SWITCH_KIT_TEMPLATE) : "/auth/signup";
  const facts = [
    { body: copy.moves, label: t("movesLabel"), name: "moves" },
    { body: copy.export, label: t("exportLabel"), name: "export" },
    { body: copy.stays, label: t("staysLabel"), name: "stays" },
  ];

  return (
    <section className="not-prose my-12" data-switch-kit={tool} id={`switch-kit-${tool}`}>
      <Heading className="text-2xl font-semibold tracking-tight text-balance">
        {t("title", { tool: copy.name })}
      </Heading>

      <p className="mt-2 text-sm leading-6 text-muted-foreground">{`${t("replacesLabel")}: ${copy.replaces}`}</p>

      <dl className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
        {facts.map((fact) => (
          <div key={fact.name} className="mk-card p-5" data-switch-kit-fact={fact.name}>
            <dt className="mk-eyebrow">{fact.label}</dt>

            <dd className="mt-2 text-sm leading-6 text-foreground">{fact.body}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-5 text-sm leading-6 text-muted-foreground">{resolveCommercialTokens(t("note"), locale)}</p>

      <p className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <AppLink appearance="inline" className="font-medium" href={signupHref}>
          {t("cta")}
        </AppLink>

        {templateVisible ? (
          <AppLink appearance="inline" href={templatePagePath(SWITCH_KIT_TEMPLATE)}>
            {t("templateLabel")}
          </AppLink>
        ) : null}

        <span className="text-xs text-subdued">{t("checked", { date: checked })}</span>
      </p>
    </section>
  );
}

export async function SwitchKit({ tool }: { tool: string }) {
  if (!isSwitchKitTool(tool)) throw new Error(`Unknown switch kit tool: ${tool}`);

  return <SwitchKitBlock locale={await getLocale()} tool={tool} />;
}

export async function SwitchKitSection({ locale }: { locale: string }) {
  const t = await getTranslations("TemplatePages.switchKit");

  return (
    <div className="w-full" data-switch-kit-section="">
      <h2 className="text-2xl font-semibold tracking-tight text-balance">{t("sectionTitle")}</h2>

      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{t("sectionLead")}</p>

      {SWITCH_KIT_TOOLS.map((tool) => (
        <SwitchKitBlock key={tool} heading="h3" locale={locale} tool={tool} />
      ))}
    </div>
  );
}
