import { headLoader } from "./head-source";

import { about } from "@/.source/heads/about";
import { affiliate } from "@/.source/heads/affiliate";
import { apiDocs } from "@/.source/heads/apiDocs";
import { apiOverview } from "@/.source/heads/apiOverview";
import { auth } from "@/.source/heads/auth";
import { automation } from "@/.source/heads/automation";
import { blog } from "@/.source/heads/blog";
import { blogPosts } from "@/.source/heads/blogPosts";
import { compare } from "@/.source/heads/compare";
import { comparePages } from "@/.source/heads/comparePages";
import { contact } from "@/.source/heads/contact";
import { docs } from "@/.source/heads/docs";
import { featurePages } from "@/.source/heads/featurePages";
import { features } from "@/.source/heads/features";
import { featuresAll } from "@/.source/heads/featuresAll";
import { forHub } from "@/.source/heads/forHub";
import { forPages } from "@/.source/heads/forPages";
import { helpAndFeedback } from "@/.source/heads/helpAndFeedback";
import { homepage } from "@/.source/heads/homepage";
import { legal } from "@/.source/heads/legal";
import { pricing } from "@/.source/heads/pricing";

export const aboutSource = headLoader("about", about);

export const affiliateSource = headLoader("affiliate", affiliate);

export const apiDocsSource = headLoader("apiDocs", apiDocs);

export const apiOverviewSource = headLoader("apiOverview", apiOverview);

export const authSource = headLoader("auth", auth);

export const automationSource = headLoader("automation", automation);

export const blogSource = headLoader("blog", blog);

export const blogPostsSource = headLoader("blogPosts", blogPosts);

export const compareSource = headLoader("compare", compare);

export const comparePagesSource = headLoader("comparePages", comparePages);

export const contactSource = headLoader("contact", contact);

export const docsSource = headLoader("docs", docs);

export const featurePagesSource = headLoader("featurePages", featurePages);

export const featuresSource = headLoader("features", features);

export const featuresAllSource = headLoader("featuresAll", featuresAll);

export const forSource = headLoader("forHub", forHub);

export const forPagesSource = headLoader("forPages", forPages);

export const helpAndFeedbackSource = headLoader("helpAndFeedback", helpAndFeedback);

export const homepageSource = headLoader("homepage", homepage);

export const legalSource = headLoader("legal", legal);

export const pricingSource = headLoader("pricing", pricing);
