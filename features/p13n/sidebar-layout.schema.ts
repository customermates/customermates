import { z } from "zod";

export const SIDEBAR_P13N_ID = "sidebar";
export const SIDEBAR_SEEDED_SECTIONS = ["overview", "data"] as const;
export const SIDEBAR_SECTION_NAME_MAX = 60;

const SidebarItemIdSchema = z.string().min(1).max(120);

const SidebarItemEntrySchema = z.object({ item: SidebarItemIdSchema }).strict();

const SidebarSectionEntrySchema = z
  .object({
    id: z.string().min(1).max(80),
    name: z.string().trim().min(1).max(SIDEBAR_SECTION_NAME_MAX).optional(),
    items: z.array(SidebarItemIdSchema).max(500),
    collapsed: z.boolean().optional(),
  })
  .strict();

export const SidebarLayoutSchema = z
  .object({
    entries: z.array(z.union([SidebarItemEntrySchema, SidebarSectionEntrySchema])).max(560),
    hidden: z.array(SidebarItemIdSchema).max(500),
  })
  .strict()
  .superRefine((layout, ctx) => {
    const sections = new Set<string>();
    const items = new Set<string>();
    const addItem = (item: string, path: (string | number)[]) => {
      if (items.has(item)) ctx.addIssue({ code: "custom", path, message: "An item appears twice" });
      items.add(item);
    };
    for (const [index, entry] of layout.entries.entries()) {
      if ("item" in entry) {
        addItem(entry.item, ["entries", index, "item"]);
        continue;
      }
      if (sections.has(entry.id))
        ctx.addIssue({ code: "custom", path: ["entries", index, "id"], message: "Duplicate section" });
      sections.add(entry.id);
      const seeded = (SIDEBAR_SEEDED_SECTIONS as readonly string[]).includes(entry.id);
      if (!seeded && !entry.name)
        ctx.addIssue({ code: "custom", path: ["entries", index, "name"], message: "A personal section needs a name" });
      for (const item of entry.items) addItem(item, ["entries", index, "items"]);
    }
  });

export type SidebarLayout = z.infer<typeof SidebarLayoutSchema>;
