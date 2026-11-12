import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpTool } from "./mcp-tool";

import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { completable } from "@modelcontextprotocol/sdk/server/completable.js";
import { z } from "zod";

import { getUserService } from "@/core/di";
import { resolveActiveTenantUser } from "@/core/decorators/resolve-tenant-user";
import { compileTemplate } from "@/core/templates/compile-template";
import { compileTemplateAutomation } from "@/core/templates/compile-template-automation";
import { renderTemplatePrompt } from "@/core/templates/template-prompt";
import {
  type TemplateDeployment,
  getTemplate,
  getTemplateText,
  isTemplateOffered,
  listTemplates,
} from "@/core/templates/template-registry";
import { type TemplateSlug, TEMPLATE_SLUGS, isTemplateSlug } from "@/core/templates/template-slugs";
import { env } from "@/env";
import { DEFAULT_LOCALE, isAppLocale } from "@/i18n/locale-registry";

import { MCP_SETUP_FROM_TEMPLATE_PROMPT_INFO, MCP_TEMPLATE_RESOURCE_INFO } from "./server-metadata";

const TEMPLATE_UNAVAILABLE = "This template is not available in this workspace.";

function deployment(): TemplateDeployment {
  return env.APP_MODE === "self-hosted" ? "self-hosted" : "cloud";
}

async function workspaceLocale(): Promise<string> {
  try {
    const user = await resolveActiveTenantUser(() => getUserService().getActiveTenantUserOrThrow());
    return isAppLocale(user.displayLanguage) ? user.displayLanguage : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function offeredTemplateSlugs(): TemplateSlug[] {
  return TEMPLATE_SLUGS.filter((slug) => isTemplateOffered(slug, { deployment: deployment() }));
}

function offeredSlug(value: unknown): TemplateSlug {
  if (!isTemplateSlug(value) || !offeredTemplateSlugs().includes(value)) throw new Error(TEMPLATE_UNAVAILABLE);
  return value;
}

export function templateResourceContents(slug: TemplateSlug, locale: string) {
  const spec = getTemplate(slug);
  const text = getTemplateText(slug, locale);
  const { plan, extras } = compileTemplate(spec, text);
  const automationRules = compileTemplateAutomation(spec, extras.rules);
  return {
    slug,
    locale: text.locale,
    name: text.name,
    summary: text.summary,
    spec,
    text,
    plan,
    extras,
    automationRules,
  };
}

export function templatePromptText(slug: TemplateSlug, locale: string): string {
  return renderTemplatePrompt(getTemplate(slug), getTemplateText(slug, locale), {
    deployment: deployment(),
    signupUrl: `${env.BASE_URL}/signup`,
    connected: true,
  });
}

function slugCompletions(value: string): string[] {
  const prefix = value.trim().toLowerCase();
  return offeredTemplateSlugs().filter((slug) => slug.startsWith(prefix));
}

function registerTemplatePrompt(server: McpServer) {
  server.registerPrompt(
    MCP_SETUP_FROM_TEMPLATE_PROMPT_INFO.name,
    {
      title: MCP_SETUP_FROM_TEMPLATE_PROMPT_INFO.title,
      description: MCP_SETUP_FROM_TEMPLATE_PROMPT_INFO.description,
      argsSchema: {
        template: completable(
          z.string().min(1).max(60).describe(MCP_SETUP_FROM_TEMPLATE_PROMPT_INFO.arguments[0].description),
          slugCompletions,
        ),
      },
    },
    async ({ template }) => {
      const slug = offeredSlug(template.trim().toLowerCase());
      return {
        messages: [
          {
            role: "user" as const,
            content: { type: "text" as const, text: templatePromptText(slug, await workspaceLocale()) },
          },
        ],
      };
    },
  );
}

function registerTemplateResources(server: McpServer) {
  server.registerResource(
    MCP_TEMPLATE_RESOURCE_INFO.name,
    new ResourceTemplate(MCP_TEMPLATE_RESOURCE_INFO.uriTemplate, {
      list: async () => {
        const locale = await workspaceLocale();
        return {
          resources: listTemplates({ locale, deployment: deployment() })
            .filter((listing) => listing.offered)
            .map((listing) => ({
              uri: `templates://${listing.slug}`,
              name: listing.slug,
              title: listing.text.name,
              description: listing.text.summary,
              mimeType: MCP_TEMPLATE_RESOURCE_INFO.mimeType,
            })),
        };
      },
      complete: { slug: slugCompletions },
    }),
    {
      title: MCP_TEMPLATE_RESOURCE_INFO.title,
      description: MCP_TEMPLATE_RESOURCE_INFO.description,
      mimeType: MCP_TEMPLATE_RESOURCE_INFO.mimeType,
    },
    async (uri, variables) => {
      const slug = offeredSlug(String(variables.slug ?? "").toLowerCase());
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: MCP_TEMPLATE_RESOURCE_INFO.mimeType,
            text: JSON.stringify(templateResourceContents(slug, await workspaceLocale())),
          },
        ],
      };
    },
  );
}

export function registerTemplateMcpFeatures(server: McpServer, tools: readonly McpTool[]) {
  const names = new Set(tools.map((tool) => tool.name));
  if (!names.has("get_workspace_context") || !names.has("discover_record_types")) return;
  registerTemplatePrompt(server);
  registerTemplateResources(server);
}
