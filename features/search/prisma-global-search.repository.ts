import { Prisma } from "@/generated/prisma";
import { Resource } from "@/generated/prisma";

import {
  GlobalSearchRepo,
  GlobalSearchData,
  GlobalSearchResult,
  GlobalSearchResultItem,
} from "./global-search.interactor";

import { BaseRepository } from "@/core/base/base-repository";
import { Repository } from "@/core/decorators/repository.decorator";

@Repository
export class PrismaGlobalSearchRepo extends BaseRepository implements GlobalSearchRepo {
  async search(data: GlobalSearchData): Promise<GlobalSearchResult> {
    const searchTerm = data.searchTerm.trim().toLowerCase();
    const searchTokens = searchTerm.split(" ").filter((token) => token.length > 0);

    const contactSearchFilter = {
      OR: searchTokens.map((token) => ({
        OR: [
          { firstName: { contains: token, mode: Prisma.QueryMode.insensitive } },
          { lastName: { contains: token, mode: Prisma.QueryMode.insensitive } },
        ],
      })),
    };

    const nameSearchFilter = {
      name: { contains: searchTerm, mode: Prisma.QueryMode.insensitive },
    };

    const [contacts, organizations, deals, services] = await Promise.all([
      this.canAccess(Resource.contacts)
        ? this.prisma.contact.findMany({
            where: {
              ...this.accessWhere("contact"),
              ...contactSearchFilter,
            },
            take: 50,
          })
        : Promise.resolve([]),
      this.canAccess(Resource.organizations)
        ? this.prisma.organization.findMany({
            where: {
              ...this.accessWhere("organization"),
              ...nameSearchFilter,
            },
            take: 50,
          })
        : Promise.resolve([]),
      this.canAccess(Resource.deals)
        ? this.prisma.deal.findMany({
            where: {
              ...this.accessWhere("deal"),
              ...nameSearchFilter,
            },
            take: 50,
          })
        : Promise.resolve([]),
      this.canAccess(Resource.services)
        ? this.prisma.service.findMany({
            where: {
              ...this.accessWhere("service"),
              ...nameSearchFilter,
            },
            take: 50,
          })
        : Promise.resolve([]),
    ]);

    function scoreContact(contact: { firstName: string; lastName: string }): number {
      const fullName = `${contact.firstName} ${contact.lastName}`.toLowerCase();
      let score = 0;

      for (const token of searchTokens) {
        const firstNameLower = contact.firstName.toLowerCase();
        const lastNameLower = contact.lastName.toLowerCase();
        const fullNameLower = fullName;

        if (firstNameLower === token || lastNameLower === token) score += 100;
        else if (fullNameLower === searchTerm) score += 90;
        else if (firstNameLower.startsWith(token) || lastNameLower.startsWith(token)) score += 50;
        else if (fullNameLower.startsWith(token)) score += 40;
        else if (firstNameLower.includes(token) || lastNameLower.includes(token)) score += 20;
        else if (fullNameLower.includes(token)) score += 10;
      }

      return score;
    }

    function scoreName(name: string): number {
      const nameLower = name.toLowerCase();
      let score = 0;

      for (const token of searchTokens) {
        if (nameLower === token) score += 100;
        else if (nameLower === searchTerm) score += 90;
        else if (nameLower.startsWith(token)) score += 50;
        else if (nameLower.includes(token)) score += 20;
      }

      return score;
    }

    const results: Array<{ item: GlobalSearchResultItem; score: number }> = [];

    contacts.forEach((contact) => {
      const name = `${contact.firstName} ${contact.lastName}`.trim();
      results.push({
        item: { type: "contact", id: contact.id, name },
        score: scoreContact(contact),
      });
    });

    organizations.forEach((org) => {
      results.push({
        item: { type: "organization", id: org.id, name: org.name },
        score: scoreName(org.name),
      });
    });

    deals.forEach((deal) => {
      results.push({
        item: { type: "deal", id: deal.id, name: deal.name },
        score: scoreName(deal.name),
      });
    });

    services.forEach((service) => {
      results.push({
        item: { type: "service", id: service.id, name: service.name },
        score: scoreName(service.name),
      });
    });

    return {
      results: results
        .sort((a, b) => b.score - a.score)
        .slice(0, 40)
        .map((item) => item.item),
    };
  }
}
