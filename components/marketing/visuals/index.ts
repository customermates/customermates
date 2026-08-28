export { GOLDEN_VISUAL_BRIEFS, getGoldenVisualBrief, validateGoldenVisualBrief } from "./goldens";
export type { GoldenVisualBrief } from "./goldens";
export {
  APPROVED_NATIVE_VISUAL_ASSETS,
  NATIVE_VISUAL_FIXTURE_SOURCES,
  VISUAL_AGENT_PROVIDER_FIXTURES,
  VISUAL_AUTOMATION_PROVIDER_FIXTURES,
  VISUAL_PERSON_FIXTURES,
  VISUAL_PROVIDER_FIXTURES,
  VISUAL_PROVIDER_PERSON_PAIRINGS,
  VISUAL_RECORD_ASSIGNEE_FIXTURES,
  VISUAL_RECORD_FIXTURES,
  VISUAL_STATUS_FIXTURES,
  getNativeVisualFixtureCatalog,
  listVisualAgentProviders,
  listVisualPeople,
  listVisualRecords,
} from "./native-fixtures";
export type {
  VisualAgentProviderFixtureId,
  VisualAutomationProviderFixtureId,
  VisualPersonFixtureId,
  VisualPersonRole,
  VisualProviderFixtureId,
  VisualRecordFixtureId,
  VisualStatusFixtureId,
} from "./native-fixtures";
export {
  NativeAgentProviderIdentity,
  NativeAutomationProviderIdentity,
  NativeRecordIdentity,
  NativeStatusBadge,
  PersonAvatar,
  PersonIdentity,
  ProviderMark,
} from "./native-visual-primitives";
export { GoldenStoryVisual } from "./story-visual";
export type { GoldenStoryVisualTheme } from "./story-visual";
export { VisualArtboard } from "./visual-artboard";
export {
  SUPPORTED_VISUAL_FACTS,
  VISUAL_KINDS,
  VISUAL_LOCALES,
  VISUAL_PATHWAYS,
  VISUAL_PLACEMENTS,
  VISUAL_REFERENCE_SYSTEM_VERSION,
  VisualBriefSchema,
  inferVisualKind,
  validateVisualBrief,
  visualSourceChecksum,
} from "./visual-contract";
export type {
  BrandIllustrationBrief,
  NoVisualBrief,
  ProductProofBrief,
  VisualBrief,
  VisualKind,
  VisualLocale,
  VisualPathway,
  VisualPlacement,
} from "./visual-contract";
export { GoldenBenchmarkReviewSheet, VisualBriefReferenceSheet } from "./visual-review-sheet";
