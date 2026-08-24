import { SceneFrame, SceneWindow, type SceneProps } from "./scene-grammar";
import { AppChip, Avatar, Card, CardContent } from "./platform";

const OWNER = { name: "Max Bergmann", photo: "/demo/avatars/photos/max-bergmann.png" };

const FIELDS = [{ label: "Deal Value", value: "€198,500" }];

export function RecordScene({ className, label }: SceneProps) {
  return (
    <SceneFrame className={className} crop="bottom" label={label}>
      <SceneWindow title="Deals · Digital Customer Platform">
        <div className="flex flex-col gap-4 p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="m-0 truncate text-lg font-semibold">Digital Customer Platform</h2>

            <AppChip size="sm" variant="warning">
              Proposal
            </AppChip>
          </div>

          <Card className="gap-2 py-3">
            <CardContent className="px-3">
              <div className="space-y-2">
                {FIELDS.map((field) => (
                  <div key={field.label} className="flex items-center justify-between gap-3 text-sm">
                    <span className="shrink-0 text-xs text-muted-foreground">{field.label}</span>

                    <span className="min-w-0 truncate text-right">{field.value}</span>
                  </div>
                ))}

                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="shrink-0 text-xs text-muted-foreground">Organizations</span>

                  <AppChip size="sm">BMW</AppChip>
                </div>

                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="shrink-0 text-xs text-muted-foreground">Assigned</span>

                  <Avatar name={OWNER.name} size="default" src={OWNER.photo} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </SceneWindow>
    </SceneFrame>
  );
}
