import { useTranslations } from "next-intl";

type Translate = ReturnType<typeof useTranslations>;

export type ConnectionOwner = "user" | "workspace";

export type ConnectionScope = "accounts" | "agents" | "deliveries" | "incoming" | "keys" | "webhooks";

function ownerLabel(t: Translate, owner: ConnectionOwner): string {
  return owner === "user" ? t("Connections.owner.user") : t("Connections.owner.workspace");
}

function scopeLabel(t: Translate, scope: ConnectionScope): string {
  switch (scope) {
    case "accounts":
      return t("Connections.scope.accounts");
    case "agents":
      return t("Connections.scope.agents");
    case "deliveries":
      return t("Connections.scope.deliveries");
    case "incoming":
      return t("Connections.scope.incoming");
    case "keys":
      return t("Connections.scope.keys");
    case "webhooks":
      return t("Connections.scope.webhooks");
  }
}

type Props = { owner: ConnectionOwner; scope: ConnectionScope };

export function ConnectionScopeLine({ owner, scope }: Props) {
  const t = useTranslations();

  return (
    <p className="text-sm text-muted-foreground" data-connection-owner={owner} data-connection-scope={scope}>
      {`${ownerLabel(t, owner)} · ${scopeLabel(t, scope)}`}
    </p>
  );
}
