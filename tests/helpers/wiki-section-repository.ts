import { PermissionService } from "@/core/base/permission.service";
import { PrismaWikiPageRepo } from "@/features/wiki/prisma-wiki-page.repository";
import { PrismaWikiSectionRepo } from "@/features/wiki/prisma-wiki-section.repository";

export const createTestWikiSectionRepo = () => new PrismaWikiSectionRepo(new PrismaWikiPageRepo(new PermissionService()));
