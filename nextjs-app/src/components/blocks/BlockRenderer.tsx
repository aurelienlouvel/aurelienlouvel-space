import type { Block } from "@/sanity/queries";
import { TextBlock } from "./TextBlock";
import { MediaBlock } from "./MediaBlock";
import { CardBlock } from "./CardBlock";
import { QuoteBlock } from "./QuoteBlock";
import { CalloutBlock } from "./CalloutBlock";

export function BlockRenderer({ block }: { block: Block }) {
  switch (block._type) {
    case "blockText":
      return (
        <div className="px-6 sm:px-16">
          <TextBlock block={block} />
        </div>
      );
    case "blockMedia":
      return (
        <div className="py-4 px-4 sm:px-0">
          <MediaBlock block={block} />
        </div>
      );
    case "blockCard":
      return (
        <div className="py-4 px-4 sm:px-8">
          <CardBlock block={block} />
        </div>
      );
    case "blockQuote":
      return (
        <div className="px-4 sm:px-16">
          <QuoteBlock block={block} />
        </div>
      );
    case "blockCallout":
      return (
        <div className="px-4 sm:px-16">
          <CalloutBlock block={block} />
        </div>
      );
    default:
      return null;
  }
}
