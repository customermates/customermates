"use client";

import { Avatar, OverlappingStack } from "./platform";

export type SceneOwner = {
  name: string;
  photo: string;
};

export function SceneAvatarStack({ owners }: { owners: readonly SceneOwner[] }) {
  return (
    <OverlappingStack
      badgeKey={(owner: SceneOwner) => owner.name}
      badges={[...owners]}
      renderBadge={(owner: SceneOwner) => <Avatar name={owner.name} src={owner.photo} />}
      renderOverflow={(count: number) => <Avatar fallback={`+${count}`} />}
    />
  );
}
