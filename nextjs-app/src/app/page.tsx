import { HugeiconsIcon } from "@hugeicons/react";
import { CursorMagicSelection04Icon } from "@hugeicons/core-free-icons";

// Embed Notion du portfolio actuel : le lien d'embed de la page publiée
// (`…notion.site/ebd/<id>`), tel que fourni par Notion.
const NOTION_EMBED_URL =
  "https://aurelienlouvel-ore.notion.site/ebd//224ca43dc6968061b974c3c6ab95f29c";

// Site WIP (le staging, staging.oré.space), cible du bouton. Écrit en punycode,
// l'écriture ASCII du domaine ; les navigateurs affichent « oré ».
const WIP_SITE_URL = "https://staging.xn--or-cja.space";

// Pas de `metadata` ici : le SEO (titre, description, icônes) est celui du
// layout, le même que sur le staging.

/**
 * Landing de production : la page Notion du portfolio actuel en plein écran, et
 * un bouton flottant (même pastille que l'ActionBar) vers le site WIP. Statique :
 * rien ici ne dépend de la requête.
 *
 * DA : `--da-corner-k` règle l'exposant des coins lissés (règle globale de
 * globals.css, `corner-shape: superellipse(k)`). 1.33 = celui de /play, au lieu
 * du repli de la feuille de style (1.53) qui s'applique quand /play n'est pas montée.
 */
export default function RootPage() {
  return (
    <main className="fixed inset-0 bg-white [--da-corner-k:1.33]">
      <iframe
        src={NOTION_EMBED_URL}
        title="oré — portfolio"
        className="block size-full border-0"
        allow="fullscreen; clipboard-write; autoplay; picture-in-picture"
      />

      <div className="pointer-events-none fixed inset-x-0 bottom-12 z-50 flex justify-center px-3">
        <div className="pointer-events-auto flex h-16 items-center rounded-3xl border border-border/60 bg-white px-2 shadow-md">
          <a
            href={WIP_SITE_URL}
            className="flex h-10 items-center gap-1.5 rounded-xl bg-main-50 px-3 text-base font-medium text-main-500 outline-none transition-transform duration-200 ease-out focus-visible:ring-3 focus-visible:ring-main-500/30 motion-safe:hover:-rotate-[1.5deg] motion-safe:hover:scale-[0.95] motion-safe:active:-rotate-2 motion-safe:active:scale-[0.87]"
          >
            <HugeiconsIcon
              icon={CursorMagicSelection04Icon}
              size={15}
              strokeWidth={2}
            />
            visit the wip site
          </a>
        </div>
      </div>
    </main>
  );
}
