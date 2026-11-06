import type { EventService } from "@/features/event/event.service";
import type { Validated } from "@/core/validation/validation.utils";
import type { PublicLinkRepo, StoredPublicLink } from "./public-link.repo";
import type { ManagePublicLinkData, PublicLinkStatus } from "./public-link.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { rolePermits } from "@/core/base/permission.service";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { fail, failAuthorization, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { DomainEvent } from "@/features/event/domain-events";
import { Action, Resource } from "@/generated/prisma";

import { publicLinkToken } from "./public-link-token";
import { ManagePublicLinkSchema, PublicLinkStatusSchema } from "./public-link.schema";

type Settings = { baseUrl: string; authSecret: string | undefined; now?: () => Date };

export function publicLinkUrl(baseUrl: string, linkId: string, authSecret: string | undefined): string {
  return `${baseUrl.replace(/\/$/u, "")}/p/${publicLinkToken(linkId, authSecret)}`;
}

export function endOfDayUtc(date: string): Date {
  return new Date(`${date}T23:59:59.999Z`);
}

@TenantInteractor()
export class ManagePublicLinkInteractor extends AuthenticatedInteractor<ManagePublicLinkData, PublicLinkStatus> {
  constructor(
    private repo: PublicLinkRepo,
    private events: EventService,
    private settings: Settings,
  ) {
    super();
  }

  @Write({ input: ManagePublicLinkSchema, output: PublicLinkStatusSchema })
  async invoke(data: ManagePublicLinkData): Validated<PublicLinkStatus> {
    const name = await this.repo.findOwnedDashboardViewName(data.viewId);
    if (name === null) return failNotFound(CustomErrorCode.dataViewNotFound, ["viewId"]);

    const workspaceAllows = await this.repo.publicLinksAllowed();
    const permitted = rolePermits(this.user.role, Resource.publicLinks, Action.create);

    if (data.action === "publish") {
      if (!workspaceAllows || !permitted) return failAuthorization(CustomErrorCode.permissionDenied, ["viewId"]);
      const now = this.settings.now?.() ?? new Date();
      const expiresAt = data.expiresAt ? endOfDayUtc(data.expiresAt) : null;
      if (expiresAt && expiresAt <= now) return fail(CustomErrorCode.publicLinkExpiryInPast, ["expiresAt"]);
      const active = await this.repo.findActiveLink(data.viewId);
      if (active) return this.status(workspaceAllows, permitted, await this.repo.setExpiry(active.id, expiresAt));
      const link = await this.repo.createLink(data.viewId, expiresAt);
      await this.events.publish(DomainEvent.PUBLIC_LINK_CREATED, {
        entityId: link.id,
        payload: { name, viewId: data.viewId, expiresAt: data.expiresAt ?? null },
      });
      return this.status(workspaceAllows, permitted, link);
    }

    if (data.action === "revoke") {
      const active = await this.repo.findActiveLink(data.viewId);
      if ((await this.repo.revokeActiveLinks(data.viewId)) > 0 && active) {
        await this.events.publish(DomainEvent.PUBLIC_LINK_REVOKED, {
          entityId: active.id,
          payload: { name, viewId: data.viewId },
        });
      }
      return this.status(workspaceAllows, permitted, null);
    }

    return this.status(workspaceAllows, permitted, await this.repo.findActiveLink(data.viewId));
  }

  private status(workspaceAllows: boolean, permitted: boolean, link: StoredPublicLink | null) {
    return {
      ok: true as const,
      data: {
        allowed: workspaceAllows && permitted,
        reason: !workspaceAllows ? ("workspaceDisabled" as const) : !permitted ? ("permissionDenied" as const) : null,
        link: link
          ? {
              url: publicLinkUrl(this.settings.baseUrl, link.id, this.settings.authSecret),
              expiresAt: link.expiresAt ? link.expiresAt.toISOString().slice(0, 10) : null,
              openCount: link.openCount,
              lastOpenedAt: link.lastOpenedAt?.toISOString() ?? null,
              createdAt: link.createdAt.toISOString(),
            }
          : null,
      },
    };
  }
}
