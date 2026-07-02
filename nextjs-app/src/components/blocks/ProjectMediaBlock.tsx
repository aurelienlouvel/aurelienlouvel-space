import Image from "next/image";

export function ProjectMediaBlock({
  url,
  isVideo,
  title,
}: {
  url: string;
  isVideo: boolean;
  title: string;
}) {
  return (
    <div className="px-4 sm:px-0">
      <div className="relative aspect-video w-full overflow-hidden rounded-4xl bg-muted">
      {isVideo ? (
        <video
          src={url}
          className="h-full w-full object-cover"
          playsInline
          muted
          autoPlay
        />
      ) : (
        <Image src={url} alt={title} fill className="object-cover" priority />
      )}
      </div>
    </div>
  );
}
