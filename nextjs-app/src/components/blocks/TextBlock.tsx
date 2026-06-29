"use client";

import { PortableText } from "@portabletext/react";
import type { BlockText } from "@/sanity/queries";
import { RichLink } from "@/components/primitives/RichLink";

type LinkMark = { _type: string; href?: string; blank?: boolean };

const portableComponents = {
  marks: {
    link: ({
      value,
      children,
    }: {
      value?: LinkMark;
      children?: React.ReactNode;
    }) => (
      <RichLink href={value?.href ?? "#"} blank={value?.blank}>
        {children}
      </RichLink>
    ),
  },
};

export function TextBlock({ block }: { block: BlockText }) {
  if (!block.body) return null;
  return (
    <div className="prose prose-stone max-w-none dark:prose-invert text-block">
      <PortableText
        value={block.body as Parameters<typeof PortableText>[0]["value"]}
        components={portableComponents}
      />
    </div>
  );
}
