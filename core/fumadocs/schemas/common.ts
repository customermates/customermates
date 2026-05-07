import { z } from "zod";

export const metaSchema = z.object({
  description: z.string(),
  title: z.string(),
});
export type Meta = z.infer<typeof metaSchema>;

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
export type CTA = z.infer<typeof ctaSchema>;

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
export type FAQ = z.infer<typeof faqSchema>;

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
