import type { TemplateLocale, TemplateRule } from "./template-spec.schema";

import { countryCodeFor } from "@/i18n/locale-registry";

const COUNTRY_CODE = /^[A-Z]{2}$/;

type RuleCopy = TemplateLocale["rules"][string];

export function templateCountry(locale: string, country?: string | null): string {
  const requested = country?.trim().toUpperCase() ?? "";
  return COUNTRY_CODE.test(requested) ? requested : countryCodeFor(locale);
}

export function resolveTemplateRule(rule: TemplateRule, country: string): TemplateRule {
  const variant = rule.variants?.[country];
  if (!variant) return rule;
  return {
    ...rule,
    trigger: variant.trigger ?? rule.trigger,
    condition: variant.condition ?? rule.condition,
    action: variant.action ?? rule.action,
    dueOffsetDays: variant.dueOffsetDays ?? rule.dueOffsetDays,
  };
}

export function templateRuleText(copy: RuleCopy, rule: TemplateRule, country: string): RuleCopy {
  const variant = rule.variants?.[country] ? copy.variants?.[country] : undefined;
  return variant ? { title: variant.title, description: variant.description } : copy;
}
