import { redirect } from "next/navigation";

// Embed Notion du portfolio actuel : le lien d'embed de la page publiée
// (`…notion.site/ebd/<id>`), tel que fourni par Notion.
const NOTION_EMBED_URL =
  "https://aurelienlouvel-ore.notion.site/ebd//224ca43dc6968061b974c3c6ab95f29c";

// Site WIP (le staging, staging.aurelienlouvel.space), cible du bouton.
const WIP_SITE_URL = "https://staging.aurelienlouvel.space";

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
  redirect("/work");
}
