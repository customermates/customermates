import jsonSchema from "fumadocs-mdx/plugins/json-schema";
import lastModified from "fumadocs-mdx/plugins/last-modified";
import { defineConfig, defineCollections } from "fumadocs-mdx/config";

import { affiliateSchema } from "./schemas/affiliate";
import { authSchema } from "./schemas/auth";
import { automationSchema } from "./schemas/automation";
import { blogPostsSchema } from "./schemas/blog-posts";
import { blogSchema } from "./schemas/blog";
import { compareSchema } from "./schemas/compare";
import { docsSchema } from "./schemas/docs";
import { featuresSchema } from "./schemas/features";
import { helpAndFeedbackSchema } from "./schemas/help-and-feedback";
import { homepageSchema } from "./schemas/homepage";
import { legalSchema } from "./schemas/legal";
import { pricingSchema } from "./schemas/pricing";
import { skillsOverviewSchema } from "./schemas/skills-overview";
import { skillsSchema } from "./schemas/skills";

export const blog = defineCollections({
  type: "doc",
  dir: "content/blog",
  schema: blogSchema,
});

export const blogPosts = defineCollections({
  type: "doc",
  dir: "content/blog-posts",
  schema: blogPostsSchema,
});

export const legal = defineCollections({
  type: "doc",
  dir: "content/legal",
  schema: legalSchema,
});

export const docs = defineCollections({
  type: "doc",
  dir: "content/docs",
  schema: docsSchema,
});

export const apiDocs = defineCollections({
  type: "doc",
  dir: "content/api",
  schema: docsSchema,
});

export const apiOverview = defineCollections({
  type: "doc",
  dir: "content/api-overview",
  schema: docsSchema,
});

export const compare = defineCollections({
  type: "doc",
  dir: "content/compare",
  schema: compareSchema,
});

export const pricing = defineCollections({
  type: "doc",
  dir: "content/pricing",
  schema: pricingSchema,
});

export const features = defineCollections({
  type: "doc",
  dir: "content/features",
  schema: featuresSchema,
});

export const helpAndFeedback = defineCollections({
  type: "doc",
  dir: "content/help-and-feedback",
  schema: helpAndFeedbackSchema,
});

export const homepage = defineCollections({
  type: "doc",
  dir: "content/homepage",
  schema: homepageSchema,
});

export const automation = defineCollections({
  type: "doc",
  dir: "content/automation",
  schema: automationSchema,
});

export const auth = defineCollections({
  type: "doc",
  dir: "content/auth",
  schema: authSchema,
});

export const affiliate = defineCollections({
  type: "doc",
  dir: "content/affiliate",
  schema: affiliateSchema,
});

export const skills = defineCollections({
  type: "doc",
  dir: "content/skills",
  schema: skillsSchema,
});

export const skillsOverview = defineCollections({
  type: "doc",
  dir: "content/skills-overview",
  schema: skillsOverviewSchema,
});

export default defineConfig({
  plugins: [jsonSchema(), lastModified()],
});
