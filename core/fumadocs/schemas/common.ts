import { z } from "zod";

export const SEO_TITLE_MAX = 60;
export const SEO_DESCRIPTION_MAX = 160;

export const seoOverrideFields = {
  metaDescription: z.string().trim().min(70).max(SEO_DESCRIPTION_MAX).optional(),
  metaTitle: z.string().trim().min(15).max(SEO_TITLE_MAX).optional(),
  updated: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u, "updated must be YYYY-MM-DD")
    .optional(),
};

export const metaSchema = z.object({
  description: z.string(),
  title: z.string(),
});

export const heroSchema = z.object({
  buttonLeftHref: z.string(),
  buttonLeftText: z.string(),
  buttonRightHref: z.string(),
  buttonRightText: z.string(),
  description: z.string(),
  hint: z.string(),
  title: z.string(),
  titleAccent: z.string().optional(),
});
export type Hero = z.infer<typeof heroSchema>;

export const ctaSchema = z.object({
  action: z.string(),
  buttonLeftHref: z.string(),
  buttonLeftText: z.string(),
  buttonRightHref: z.string(),
  buttonRightText: z.string(),
  description: z.string(),
  hint: z.string(),
});

export const faqItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
});
export type FAQItem = z.infer<typeof faqItemSchema>;

export const faqSchema = z.object({
  faqs: z.array(faqItemSchema),
  title: z.string().optional(),
});

const featureItemSchema = z.object({
  description: z.string(),
  icon: z.string(),
  image: z.string(),
  title: z.string(),
});

export const featuresSchema = z.object({
  badge: z.string(),
  features: z.array(featureItemSchema),
  subtitle: z.string(),
  title: z.string(),
});
export type Features = z.infer<typeof featuresSchema>;
