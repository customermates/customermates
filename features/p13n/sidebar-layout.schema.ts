import { z } from "zod";

export const SIDEBAR_P13N_ID = "sidebar";
export const SIDEBAR_BUILT_IN_SECTIONS = ["overview", "data", "workspace", "admin"] as const;
export const SIDEBAR_SECTION_NAME_MAX = 60;

const SidebarItemIdSchema = z.string().min(1).max(120);

export const SidebarLayoutSchema = z
  .object({
    sections: z
      .array(
        z
          .object({
            id: z.string().min(1).max(80),
            name: z.string().trim().min(1).max(SIDEBAR_SECTION_NAME_MAX).optional(),
            items: z.array(SidebarItemIdSchema).max(500),
            collapsed: z.boolean().optional(),
          })
          .strict(),
      )
      .max(60),
    hidden: z.array(SidebarItemIdSchema).max(500),
  })
  .strict()
  .superRefine((layout, ctx) => {
    const sections = new Set<string>();
    const items = new Set<string>();
    for (const [index, section] of layout.sections.entries()) {
      if (sections.has(section.id))
        ctx.addIssue({ code: "custom", path: ["sections", index, "id"], message: "Duplicate section" });
      sections.add(section.id);
      const builtIn = (SIDEBAR_BUILT_IN_SECTIONS as readonly string[]).includes(section.id);
      if (!builtIn && !section.name)
        ctx.addIssue({ code: "custom", path: ["sections", index, "name"], message: "A personal section needs a name" });
      for (const item of section.items) {
        if (items.has(item))
          ctx.addIssue({ code: "custom", path: ["sections", index, "items"], message: "An item appears twice" });
        items.add(item);
      }
    }
  });

export type SidebarLayout = z.infer<typeof SidebarLayoutSchema>;
