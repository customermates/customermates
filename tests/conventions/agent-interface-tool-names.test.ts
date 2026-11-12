import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AGENT_PANEL_TOOL_NAMES } from "@/ee/agent-chat/agent-ui-command";
import { ANALYSIS_MAX_BYTES, ANALYSIS_MAX_READS, ANALYSIS_MAX_ROWS } from "@/ee/agent-chat/agent-analysis";
import { ANALYZE_RECORDS_TOOL_NAME, LOAD_TOOLSET_TOOL_NAME } from "@/ee/agent-chat/agent-toolset-routing";
import { CONTENT_LOCALES } from "@/i18n/locale-registry";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const INTERFACE_TOOL_NAMES = ["list_ui_targets", ...AGENT_PANEL_TOOL_NAMES] as const;
const RETIRED_INTERFACE_TOOL_NAMES = ["open_record", "click_ui_target"] as const;
const BACKTICKED_IDENTIFIER = /`([a-z][a-z0-9_]*)`/g;

const assistantPages = CONTENT_LOCALES.map((locale) => ({
  locale,
  path: `content/docs/${locale}/app-assistant.mdx`,
}));

describe("agent interface tool names in the assistant documentation", () => {
  it.each(assistantPages)("names every interface tool in $locale", ({ path }) => {
    const source = read(path);
    for (const name of INTERFACE_TOOL_NAMES) expect(source).toContain(`\`${name}\``);
  });

  it.each(assistantPages)("names the tools only Mate has and the analysis limits in $locale", ({ locale, path }) => {
    const source = read(path);
    const onlyMate = {
      en: `plus four interface tools, \`${LOAD_TOOLSET_TOOL_NAME}\` and \`${ANALYZE_RECORDS_TOOL_NAME}\`, which only Mate has.`,
      de: `dafür mit vier Oberflächen-Tools, \`${LOAD_TOOLSET_TOOL_NAME}\` und \`${ANALYZE_RECORDS_TOOL_NAME}\`, die nur Mate hat.`,
      fr: `plus quatre outils d’interface, \`${LOAD_TOOLSET_TOOL_NAME}\` et \`${ANALYZE_RECORDS_TOOL_NAME}\`, que seul Mate possède.`,
      it: `più quattro strumenti dell’interfaccia, \`${LOAD_TOOLSET_TOOL_NAME}\` e \`${ANALYZE_RECORDS_TOOL_NAME}\`, che ha solo Mate.`,
      es: `más cuatro herramientas de interfaz, \`${LOAD_TOOLSET_TOOL_NAME}\` y \`${ANALYZE_RECORDS_TOOL_NAME}\`, que solo tiene Mate.`,
      pt: `mais quatro ferramentas de interface, \`${LOAD_TOOLSET_TOOL_NAME}\` e \`${ANALYZE_RECORDS_TOOL_NAME}\`, que só o Mate tem.`,
      pl: `plus cztery narzędzia interfejsu, \`${LOAD_TOOLSET_TOOL_NAME}\` i \`${ANALYZE_RECORDS_TOOL_NAME}\`, które ma tylko Mate.`,
      nl: `plus vier interfacetools, \`${LOAD_TOOLSET_TOOL_NAME}\` en \`${ANALYZE_RECORDS_TOOL_NAME}\`, die alleen Mate heeft.`,
    }[locale];
    const reads = {
      en: "It runs up to ten reads",
      de: "Es führt bis zu zehn Lesezugriffe",
      fr: "Il exécute jusqu’à dix lectures",
      it: "Esegue fino a dieci letture",
      es: "Ejecuta hasta diez lecturas",
      pt: "Ele executa até dez leituras",
      pl: "Wykonuje do dziesięciu odczytów",
      nl: "Het voert maximaal tien leesacties uit",
    }[locale];
    const limits = {
      en: `up to ${ANALYSIS_MAX_ROWS.toLocaleString("en")} rows and ${ANALYSIS_MAX_BYTES / 1024 / 1024} MB across all reads together`,
      de: `insgesamt bis zu ${ANALYSIS_MAX_ROWS.toLocaleString("de")} Zeilen und ${ANALYSIS_MAX_BYTES / 1024 / 1024} MB über alle Lesezugriffe`,
      fr: `jusqu’à ${ANALYSIS_MAX_ROWS.toLocaleString("fr").replace(/\u202f/g, "\u00a0")} lignes et ${ANALYSIS_MAX_BYTES / 1024 / 1024}\u00a0Mo pour toutes les lectures ensemble`,
      it: `fino a ${ANALYSIS_MAX_ROWS.toLocaleString("it")} righe e ${ANALYSIS_MAX_BYTES / 1024 / 1024} MB in tutte le letture insieme`,
      es: `hasta ${ANALYSIS_MAX_ROWS.toLocaleString("es")} filas y ${ANALYSIS_MAX_BYTES / 1024 / 1024} MB entre todas las lecturas juntas`,
      pt: `até ${ANALYSIS_MAX_ROWS.toLocaleString("pt")} linhas e ${ANALYSIS_MAX_BYTES / 1024 / 1024} MB somando todas as leituras`,
      pl: `do ${ANALYSIS_MAX_ROWS.toLocaleString("pl").replace(/\u00a0/g, " ")} wierszy i ${ANALYSIS_MAX_BYTES / 1024 / 1024} MB we wszystkich odczytach łącznie`,
      nl: `tot ${ANALYSIS_MAX_ROWS.toLocaleString("nl")} rijen en ${ANALYSIS_MAX_BYTES / 1024 / 1024} MB over alle leesacties samen`,
    }[locale];
    expect(ANALYSIS_MAX_READS).toBe(10);
    expect(source).toContain(onlyMate);
    expect(source).toContain(reads);
    expect(source).toContain(limits);
  });

  it.each(assistantPages)("names no retired interface tool in $locale", ({ path }) => {
    const source = read(path);
    for (const name of RETIRED_INTERFACE_TOOL_NAMES) expect(source).not.toContain(`\`${name}\``);
  });

  it.each(assistantPages)("uses no near-miss interface tool name in $locale", ({ path }) => {
    const source = read(path);
    const nearMisses = [...source.matchAll(BACKTICKED_IDENTIFIER)]
      .map((match) => match[1])
      .filter((identifier) =>
        INTERFACE_TOOL_NAMES.some(
          (name) => name !== identifier && (name.startsWith(`${identifier}_`) || name.endsWith(`_${identifier}`)),
        ),
      );
    expect(nearMisses).toEqual([]);
  });
});
