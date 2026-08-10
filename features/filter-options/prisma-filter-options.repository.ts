import type {
  ResolveFilterOptionsData,
  ResolveFilterOptionsRepo,
  ResolvedFilterOption,
} from "./resolve-filter-options.interactor";

import { BaseRepository } from "@/core/base/base-repository";

export class PrismaFilterOptionsRepo extends BaseRepository implements ResolveFilterOptionsRepo {
  async resolve({ source, ids }: ResolveFilterOptionsData): Promise<ResolvedFilterOption[]> {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) return [];

    let options: ResolvedFilterOption[];
    switch (source) {
      case "user": {
        const users = await this.prisma.user.findMany({
          where: { id: { in: uniqueIds }, ...this.accessWhere("user") },
          select: { id: true, firstName: true, lastName: true, avatarUrl: true },
        });
        options = users.map((user) => ({
          key: user.id,
          label: `${user.firstName} ${user.lastName}`.trim(),
          avatarUrl: user.avatarUrl,
        }));
        break;
      }
      case "contact": {
        const contacts = await this.prisma.contact.findMany({
          where: { id: { in: uniqueIds }, ...this.accessWhere("contact") },
          select: { id: true, firstName: true, lastName: true, avatarUrl: true },
        });
        options = contacts.map((contact) => ({
          key: contact.id,
          label: `${contact.firstName} ${contact.lastName}`.trim(),
          avatarUrl: contact.avatarUrl,
        }));
        break;
      }
      case "organization": {
        const organizations = await this.prisma.organization.findMany({
          where: { id: { in: uniqueIds }, ...this.accessWhere("organization") },
          select: { id: true, name: true },
        });
        options = organizations.map((organization) => ({ key: organization.id, label: organization.name }));
        break;
      }
      case "deal": {
        const deals = await this.prisma.deal.findMany({
          where: { id: { in: uniqueIds }, ...this.accessWhere("deal") },
          select: { id: true, name: true },
        });
        options = deals.map((deal) => ({ key: deal.id, label: deal.name }));
        break;
      }
      case "service": {
        const services = await this.prisma.service.findMany({
          where: { id: { in: uniqueIds }, ...this.accessWhere("service") },
          select: { id: true, name: true },
        });
        options = services.map((service) => ({ key: service.id, label: service.name }));
        break;
      }
      case "task": {
        const tasks = await this.prisma.task.findMany({
          where: { id: { in: uniqueIds }, ...this.accessWhere("task") },
          select: { id: true, name: true, type: true },
        });
        options = tasks.map((task) => ({ key: task.id, label: task.name, taskType: task.type }));
        break;
      }
    }

    const byId = new Map(options.map((option) => [option.key, option]));
    return uniqueIds.flatMap((id) => {
      const option = byId.get(id);
      return option ? [option] : [];
    });
  }
}
