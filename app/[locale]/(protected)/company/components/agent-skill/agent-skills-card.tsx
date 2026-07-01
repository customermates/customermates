"use client";

import type { AgentSkillDto } from "@/features/agent-chat/agent-skill.repo";

import { useCallback, useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppChip } from "@/components/chip/app-chip";
import { Icon } from "@/components/shared/icon";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { Resource } from "@/generated/prisma";

import { AgentSkillModal, type AgentSkillFormValue } from "./agent-skill-modal";

// The API serialises the DTO to JSON, so Date fields arrive as ISO strings.
type AgentSkill = Omit<AgentSkillDto, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};

type LoadState = "loading" | "ready" | "error";

export const AgentSkillsCard = observer(() => {
  const t = useTranslations("AgentSkills");
  const { userStore } = useRootStore();
  const { showDeleteConfirmation } = useDeleteConfirmation();

  // The MobX user store is empty during SSR (it's hydrated client-side in
  // NavigationSwitch), so permission-gated controls must stay hidden until after
  // mount — otherwise the server/client markup diverges and React warns about a
  // hydration mismatch. Gate canManage behind `mounted` to keep the first client
  // render identical to the server output.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const canManage = mounted && userStore.canManage(Resource.company);

  const [skills, setSkills] = useState<AgentSkill[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AgentSkill | null>(null);
  // ids currently being toggled/saved, so we can disable their row controls.
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const markPending = useCallback((id: string, pending: boolean) => {
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch("/api/agent/skills");
      if (!res.ok) throw new Error(String(res.status));
      const data: AgentSkill[] = await res.json();
      setSkills(data);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = useCallback(() => {
    setEditing(null);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((skill: AgentSkill) => {
    setEditing(skill);
    setModalOpen(true);
  }, []);

  const submit = useCallback(
    async (value: AgentSkillFormValue) => {
      const isEdit = Boolean(editing);
      const res = await fetch(isEdit ? `/api/agent/skills/${editing?.id}` : "/api/agent/skills", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(value),
      });

      if (!res.ok) {
        toast.error(isEdit ? t("toast.updateError") : t("toast.createError"));
        return false;
      }

      toast.success(isEdit ? t("toast.updated") : t("toast.created"));
      setModalOpen(false);
      setEditing(null);
      await load();
      return true;
    },
    [editing, load, t],
  );

  const toggleEnabled = useCallback(
    async (skill: AgentSkill, enabled: boolean) => {
      markPending(skill.id, true);
      // Optimistic flip; reverted on failure.
      setSkills((prev) => prev.map((s) => (s.id === skill.id ? { ...s, enabled } : s)));
      try {
        const res = await fetch(`/api/agent/skills/${skill.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: skill.name,
            title: skill.title,
            summary: skill.summary,
            instructions: skill.instructions,
            enabled,
            sortOrder: skill.sortOrder,
          }),
        });
        if (!res.ok) throw new Error(String(res.status));
        toast.success(enabled ? t("toast.enabled") : t("toast.disabled"));
      } catch {
        setSkills((prev) => prev.map((s) => (s.id === skill.id ? { ...s, enabled: !enabled } : s)));
        toast.error(t("toast.updateError"));
      } finally {
        markPending(skill.id, false);
      }
    },
    [markPending, t],
  );

  const remove = useCallback(
    (skill: AgentSkill) => {
      showDeleteConfirmation(async () => {
        markPending(skill.id, true);
        try {
          const res = await fetch(`/api/agent/skills/${skill.id}`, { method: "DELETE" });
          if (!res.ok) throw new Error(String(res.status));
          setSkills((prev) => prev.filter((s) => s.id !== skill.id));
          toast.success(t("toast.deleted"));
        } catch {
          toast.error(t("toast.deleteError"));
        } finally {
          markPending(skill.id, false);
        }
      }, skill.title);
    },
    [markPending, showDeleteConfirmation, t],
  );

  return (
    <>
      <AppCard>
        <AppCardHeader className="pb-6">
          <div className="flex w-full items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-x-lg">{t("title")}</h2>

              <p className="text-subdued text-sm">{t("description")}</p>
            </div>

            {canManage && (
              <Button className="shrink-0" onClick={openCreate}>
                <Icon icon={Plus} />

                {t("actions.add")}
              </Button>
            )}
          </div>
        </AppCardHeader>

        <AppCardBody className="pt-0">
          {state === "loading" ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          ) : state === "error" ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-subdued text-sm">{t("error")}</p>

              <Button size="sm" variant="outline" onClick={() => void load()}>
                {t("actions.retry")}
              </Button>
            </div>
          ) : skills.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Icon className="size-8 text-subdued" icon={Sparkles} />

              <p className="text-subdued text-sm">{t("empty")}</p>

              {canManage && (
                <Button size="sm" variant="outline" onClick={openCreate}>
                  <Icon icon={Plus} />

                  {t("actions.addFirst")}
                </Button>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {skills.map((skill) => {
                const isPending = pendingIds.has(skill.id);
                return (
                  <li key={skill.id} className="flex items-start gap-4 p-4">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">{skill.title}</span>

                        <AppChip size="sm" variant="secondary">
                          {skill.name}
                        </AppChip>

                        {!skill.enabled && (
                          <AppChip size="sm" variant="warning">
                            {t("status.disabled")}
                          </AppChip>
                        )}
                      </div>

                      <p className="line-clamp-2 text-subdued text-sm">{skill.summary}</p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      <Switch
                        aria-label={t("actions.toggle")}
                        checked={skill.enabled}
                        disabled={!canManage || isPending}
                        onCheckedChange={(checked) => void toggleEnabled(skill, checked)}
                      />

                      <Button
                        disabled={isPending}
                        size="icon-sm"
                        title={t("actions.edit")}
                        variant="ghost"
                        onClick={() => openEdit(skill)}
                      >
                        {isPending ? <Loader2 className="size-4 animate-spin" /> : <Icon icon={Pencil} />}
                      </Button>

                      {canManage && (
                        <Button
                          disabled={isPending}
                          size="icon-sm"
                          title={t("actions.delete")}
                          variant="ghost"
                          onClick={() => remove(skill)}
                        >
                          <Icon className="text-destructive" icon={Trash2} />
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </AppCardBody>
      </AppCard>

      <AgentSkillModal
        canManage={canManage}
        initialValue={
          editing
            ? {
                name: editing.name,
                title: editing.title,
                summary: editing.summary,
                instructions: editing.instructions,
                enabled: editing.enabled,
                sortOrder: editing.sortOrder,
              }
            : null
        }
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) setEditing(null);
        }}
        onSubmit={submit}
      />
    </>
  );
});
