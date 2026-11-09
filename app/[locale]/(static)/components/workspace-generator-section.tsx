import { HomepageWorkspaceGenerator } from "./homepage-workspace-generator";
import { homepageContent } from "./landing-sections";

export function WorkspaceGeneratorSection({ locale }: { locale: string }) {
  return <HomepageWorkspaceGenerator generator={homepageContent(locale).generator} locale={locale} />;
}
