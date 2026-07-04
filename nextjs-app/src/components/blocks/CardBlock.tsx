"use client"; // required for PortableText

import { PortableText } from "@portabletext/react";
import type { BlockCard, CardItem } from "@/sanity/queries";
import { Icon } from "@/components/primitives/Icon";

// Spreads N cards symmetrically around 0deg, STEP degrees apart — no lookup
// table needed, works for any item count (Sanity allows any N >= 1).
function rotationFor(i: number, n: number): number {
  if (n <= 1) return 0;
  const STEP = 1.5; // degrees
  const mid = (n - 1) / 2;
  return Number(((i - mid) * STEP).toFixed(2));
}

const descComponents = {
  block: {
    // Chaque bloc = une ligne — Enter dans Sanity = saut de ligne visuel
    normal: ({ children }: { children?: React.ReactNode }) => (
      <span className="block leading-[1.4] font-[580]">{children}</span>
    ),
  },
  marks: {
    strong: ({ children }: { children?: React.ReactNode }) => (
      <strong className="font-[680]">{children}</strong>
    ),
    em: ({ children }: { children?: React.ReactNode }) => (
      <em className="font-[480]">{children}</em>
    ),
  },
};

function CardItemComponent({ item }: { item: CardItem }) {
  const c = item.color ?? "stone";

  return (
    <div
      className={`
        w-fit max-w-xs h-full break-words
        bg-gradient-to-b from-${c}-50 to-${c}-100
        border border-${c}-200
        rounded-3xl p-8
        flex flex-col gap-2
      `}
      style={{
        boxShadow:
          "inset 0 0 0 4px rgba(255,255,255,0.5), 0 2px 6px rgba(80,70,60,0.07), 0 6px 20px rgba(80,70,60,0.05)",
        isolation: "isolate",
      }}
    >
      {item.icon && (
        <div className={`mb-2 text-${c}-600 mix-blend-multiply opacity-30`}>
          <Icon name={item.icon} size={48} strokeWidth={1.6} />
        </div>
      )}

      {(item.value || item.unit) && (
        <div
          className={`flex items-baseline gap-2 text-${c}-600 mix-blend-multiply`}
        >
          {item.value && (
            <span className="text-4xl font-bold tracking-tight opacity-80">
              {item.value}
            </span>
          )}
          {item.unit && (
            <span className="text-md font-medium opacity-60">{item.unit}</span>
          )}
        </div>
      )}

      {item.title && (
        <p
          className={`text-2xl font-semibold text-${c}-600 mix-blend-multiply opacity-80`}
        >
          {item.title.split("\n").map((line, i) => (
            <span key={i} className="block">
              {line}
            </span>
          ))}
        </p>
      )}

      {item.description && (
        <div
          className={`text-md font-[200] text-${c}-700 mix-blend-multiply opacity-60`}
        >
          <PortableText
            value={
              item.description as Parameters<typeof PortableText>[0]["value"]
            }
            components={descComponents}
          />
        </div>
      )}
    </div>
  );
}

export function CardBlock({ block }: { block: BlockCard }) {
  const items = block.items ?? [];

  if (!items.length) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap justify-start gap-6 w-full">
        {items.map((item, i) => (
          <div
            key={item._key}
            style={{
              transform: `rotate(${rotationFor(i, items.length)}deg)`,
              zIndex: i + 1,
            }}
            className="relative"
          >
            <CardItemComponent item={item} />
          </div>
        ))}
      </div>

      {block.caption && (
        <p className="text-sm text-stone-600 text-center">{block.caption}</p>
      )}
    </div>
  );
}
