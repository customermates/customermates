import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpTool } from "./mcp-tool";

import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { completable } from "@modelcontextprotocol/sdk/server/completable.js";
import { z } from "zod";

import { getGetSubscriptionInteractor, getUserService } from "@/core/di";
import { resolveActiveTenantUser } from "@/core/decorators/resolve-tenant-user";
import { compileTemplate } from "@/core/templates/compile-template";
import { compileTemplateAutomation } from "@/core/templates/compile-template-automation";
import { templateDeployment } from "@/core/templates/template-deployment";
import { signupUrl } from "@/core/templates/template-page-model";
import { renderTemplatePrompt } from "@/core/templates/template-prompt";
import { listOfferedTemplates, loadTemplate } from "@/core/templates/template-registry";
import { type TemplateSlug, isTemplateSlug } from "@/core/templates/template-slugs";
import { routineAllowanceOf } from "@/ee/subscription/entitlements";
import { DEFAULT_LOCALE, isAppLocale } from "@/i18n/locale-registry";

import { MCP_SETUP_FROM_TEMPLATE_PROMPT_INFO, MCP_TEMPLATE_RESOURCE_INFO } from "./server-metadata";

const TEMPLATE_UNAVAILABLE = "This template is not available in this workspace.";

async function workspaceLocale(): Promise<string> {
  try {
    const user = await resolveActiveTenantUser(() => getUserService().getActiveTenantUserOrThrow());
    return isAppLocale(user.displayLanguage) ? user.displayLanguage : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

async function workspaceRoutineAllowance(): Promise<number | "unlimited" | null> {
  try {
    const subscription = await getGetSubscriptionInteractor().invoke();
    return subscription.ok ? routineAllowanceOf(subscription.data) : null;
  } catch {
    return null;
  }
}

export function offeredTemplateSlugs(): TemplateSlug[] {
  return listOfferedTemplates({ locale: DEFAULT_LOCALE, deployment: templateDeployment() }).map(
    (listing) => listing.slug,
  );
}

function offeredSlug(value: unknown): TemplateSlug {
  if (!isTemplateSlug(value) || !offeredTemplateSlugs().includes(value)) throw new Error(TEMPLATE_UNAVAILABLE);
  return value;
}

export async function templateResourceContents(slug: TemplateSlug, locale: string) {
  const { spec, text } = await loadTemplate(slug, locale);
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

export async function templatePromptText(slug: TemplateSlug, locale: string): Promise<string> {
  const { spec, text } = await loadTemplate(slug, locale);
  return renderTemplatePrompt(spec, text, {
    deployment: templateDeployment(),
    signupUrl: signupUrl(locale),
    connected: true,
    routineAllowance: await workspaceRoutineAllowance(),
  });
}

function slugCompletions(value: string): string[] {
  const prefix = value.trim().toLowerCase();
  return offeredTemplateSlugs().filter((slug) => slug.startsWith(prefix));
}

function describePromptArgument(schema: z.ZodString, description: string) {
  const definition = { ...schema._zod.def, description };
  return schema.clone(definition);
}

function registerTemplatePrompt(server: McpServer) {
  server.registerPrompt(
    MCP_SETUP_FROM_TEMPLATE_PROMPT_INFO.name,
    {
      title: MCP_SETUP_FROM_TEMPLATE_PROMPT_INFO.title,
      description: MCP_SETUP_FROM_TEMPLATE_PROMPT_INFO.description,
      argsSchema: {
        template: completable(
          describePromptArgument(
            z.string().min(1).max(60),
            MCP_SETUP_FROM_TEMPLATE_PROMPT_INFO.arguments[0].description,
          ),
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
            content: { type: "text" as const, text: await templatePromptText(slug, await workspaceLocale()) },
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
          resources: listOfferedTemplates({ locale, deployment: templateDeployment() }).map((listing) => ({
            uri: `templates://${listing.slug}`,
            name: listing.slug,
            title: listing.name,
            description: listing.summary,
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
            text: JSON.stringify(await templateResourceContents(slug, await workspaceLocale())),
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
