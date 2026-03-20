import { z } from "zod";

export const metaSchema = z.object({
  description: z.string(),
  title: z.string(),
});
export type Meta = z.infer<typeof metaSchema>;

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

export const testimonialItemSchema = z.object({
  avatar: z.string(),
  description: z.string(),
  name: z.string(),
  rating: z.union([z.literal(4), z.literal(4.5), z.literal(5)]),
  text: z.string(),
});
export type TestimonialItem = z.infer<typeof testimonialItemSchema>;

export const testimonialsSchema = z.object({
  badge: z.string(),
  subtitle: z.string(),
  testimonials: z.array(testimonialItemSchema),
  title: z.string(),
});
export type Testimonials = z.infer<typeof testimonialsSchema>;

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
