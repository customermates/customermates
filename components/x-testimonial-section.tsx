"use client";

import type { Testimonials } from "@/core/fumadocs/schemas/common";

import { User } from "@heroui/user";
import { StarIcon } from "@heroicons/react/24/solid";

import { XCard } from "@/components/x-card/x-card";
import { XCardBody } from "@/components/x-card/x-card-body";
import { XSectionBadge } from "@/components/x-section-badge";
import { XImage } from "@/components/x-image";

type Props = {
  testimonialsSection: Testimonials;
};

function StarRating({ rating }: { rating: 4 | 4.5 | 5 }) {
  const stars = [];
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 !== 0;

  for (let i = 0; i < fullStars; i++) stars.push(<StarIcon key={i} className="w-6 h-6 text-yellow-500" />);

  if (hasHalfStar) {
    stars.push(
      <div key="half" className="relative w-6 h-6">
        <StarIcon className="absolute w-6 h-6 text-gray-300" />

        <div className="absolute overflow-hidden w-3 h-6">
          <StarIcon className="w-6 h-6 text-yellow-500" />
        </div>
      </div>,
    );
  }

  const emptyStars = 5 - Math.ceil(rating);
  for (let i = 0; i < emptyStars; i++) stars.push(<StarIcon key={`empty-${i}`} className="w-6 h-6 text-gray-300" />);

  return <div className="flex gap-1">{stars}</div>;
}

export function XTestimonialSection({ testimonialsSection }: Props) {
  return (
    <section className="py-10 md:py-16 w-full" id="testimonials">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-10 md:mb-16">
          <XSectionBadge className="mb-4">{testimonialsSection.badge}</XSectionBadge>

          <h2 className="text-x-3xl">{testimonialsSection.title}</h2>

          <p className="mt-4 text-x-xl text-subdued max-w-2xl mx-auto">{testimonialsSection.subtitle}</p>
        </div>

        <div className="columns-1 md:columns-2 lg:columns-3 gap-4 space-y-4">
          {testimonialsSection.testimonials.map((testimonial, index) => (
            <XCard key={index} className="break-inside-avoid mb-4 relative">
              <XImage
                alt=""
                className="absolute top-5 right-5"
                height={48}
                loading="lazy"
                src="claim-icon.svg"
                width={48}
              />

              <XCardBody>
                <User
                  avatarProps={{
                    isBordered: true,
                    size: "sm",
                    src: testimonial.avatar,
                    name: testimonial.name,
                    imgProps: { loading: "lazy", decoding: "async" },
                  }}
                  classNames={{
                    base: "mr-auto",
                    description: "text-xs text-subdued",
                    name: "text-md text-foreground",
                  }}
                  description={testimonial.description}
                  name={testimonial.name}
                />

                <StarRating rating={testimonial.rating} />

                <p className="text-x-sm text-subdued leading-normal mt-3">{testimonial.text}</p>
              </XCardBody>
            </XCard>
          ))}
        </div>
      </div>
    </section>
  );
}
