"use client";

type Props = {
  id: string;
  title?: string;
};

export function YouTube({ id, title = "YouTube video" }: Props) {
  return (
    <div className="relative w-full my-6 rounded-xl overflow-hidden" style={{ paddingBottom: "56.25%" }}>
      <iframe
        allowFullScreen
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        className="absolute inset-0 size-full"
        loading="lazy"
        src={`https://www.youtube-nocookie.com/embed/${id}`}
        title={title}
      />
    </div>
  );
}
