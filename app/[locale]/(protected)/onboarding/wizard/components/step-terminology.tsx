"use client";

import { useEffect } from "react";
import { observer } from "mobx-react-lite";

import { useRootStore } from "@/core/stores/root-store.provider";
import { TerminologyRelationshipDiagram } from "@/components/entity-terminology/terminology-relationship-diagram";

export const StepTerminology = observer(() => {
  const { onboardingWizardStore } = useRootStore();

  useEffect(() => {
    onboardingWizardStore.setBeforeNext(onboardingWizardStore.persistTerminology);
    return () => onboardingWizardStore.setBeforeNext(null);
  }, [onboardingWizardStore]);

  return (
    <TerminologyRelationshipDiagram
      hideHeader
      selections={onboardingWizardStore.terminology}
      onPreset={onboardingWizardStore.setTerminologyPreset}
    />
  );
});
