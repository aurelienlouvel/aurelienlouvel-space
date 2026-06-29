"use client";

import { useState, useRef, useCallback } from "react";
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@/components/ui/HoverCard";
import { cn } from "@/lib/utils";

interface RichLinkProps {
  href: string;
  blank?: boolean;
  children: React.ReactNode;
}

type OGData = {
  title: string | null;
  description: string | null;
  image: string | null;
};

// Module-level cache — survives re-renders, deduplicates concurrent hovers
const ogCache = new Map<string, OGData | "error">();

function getFaviconUrl(href: string): string {
  try {
    const { hostname } = new URL(href);
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
  } catch {
    return "";
  }
}

function getDomain(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return href;
  }
}

export function RichLink({ href, blank, children }: RichLinkProps) {
  const faviconUrl = getFaviconUrl(href);
  const domain = getDomain(href);

  const [meta, setMeta] = useState<OGData | null>(null);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);

  const prefetch = useCallback(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    const cached = ogCache.get(href);
    if (cached) {
      if (cached !== "error") setMeta(cached);
      return;
    }

    setLoading(true);
    fetch(`/api/og?url=${encodeURIComponent(href)}`)
      .then((r) => r.json())
      .then((data: OGData) => {
        ogCache.set(href, data);
        setMeta(data);
      })
      .catch(() => {
        ogCache.set(href, "error");
      })
      .finally(() => setLoading(false));
  }, [href]);

  return (
    <HoverCard>
      <HoverCardTrigger
        href={href}
        target={blank ? "_blank" : undefined}
        rel={blank ? "noopener noreferrer" : undefined}
        delay={250}
        closeDelay={100}
        onPointerEnter={prefetch}
        className={cn(
          "inline whitespace-nowrap rounded-lg px-1.5 leading-[inherit]",
          "box-decoration-clone [box-decoration-break:clone]",
          "no-underline text-current hover:bg-stone-50 transition-colors duration-150 group",
        )}
      >
        {faviconUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={faviconUrl}
            alt=""
            aria-hidden
            width={12}
            height={12}
            className="mr-1 inline-block size-3 shrink-0 rounded-[2px] object-contain align-middle !mt-0 !mb-0"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        )}
        <span className="underline underline-offset-2 decoration-stone-300 group-hover:decoration-stone-600 transition-colors duration-150">
          {children}
        </span>
      </HoverCardTrigger>

      <HoverCardContent
        side="bottom"
        align="center"
        sideOffset={8}
        className="w-72 p-0 overflow-hidden"
      >
        {loading ? (
          <div className="w-full h-36 bg-stone-100 animate-pulse" />
        ) : meta?.image ? (
          <div className="w-full h-36 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={meta.image}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.parentElement!.style.display = "none";
              }}
            />
          </div>
        ) : null}

        <div className="p-3 flex flex-col gap-1.5">
          {loading ? (
            <div className="h-3.5 bg-stone-100 rounded-md animate-pulse w-3/4" />
          ) : (
            <p className="text-sm font-semibold text-stone-800 leading-tight line-clamp-2">
              {meta?.title ?? domain}
            </p>
          )}

          {loading ? (
            <div className="flex flex-col gap-1.5">
              <div className="h-2.5 bg-stone-100 rounded-md animate-pulse" />
              <div className="h-2.5 bg-stone-100 rounded-md animate-pulse w-4/5" />
              <div className="h-2.5 bg-stone-100 rounded-md animate-pulse w-2/3" />
            </div>
          ) : meta?.description ? (
            <p className="text-xs text-stone-500 leading-snug line-clamp-3">
              {meta.description}
            </p>
          ) : null}

          <div className="flex items-center gap-1.5 mt-0.5">
            {faviconUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={faviconUrl}
                alt=""
                aria-hidden
                width={12}
                height={12}
                className="w-3 h-3 rounded-[2px] shrink-0 object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            )}
            <span className="text-xs text-stone-400 truncate">{children}</span>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
