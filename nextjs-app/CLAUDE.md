@AGENTS.md

# oré — Next.js App

## Structure

```
src/
├── app/
│   ├── layout.tsx                  # Fonts, ActionBarProvider, ActionBar
│   ├── page.tsx                    # Redirect → /work
│   ├── work/page.tsx               # Grille projets (3 cols)
│   ├── work/[slug]/page.tsx        # Page projet (server component)
│   ├── work/[slug]/project-page-client.tsx  # Passe le projet à l'ActionBar
│   ├── play/page.tsx
│   └── info/page.tsx
├── components/
│   ├── ui/                         # shadcn — ne pas éditer manuellement
│   ├── action-bar.tsx              # Barre de nav flottante (client)
│   └── project-card.tsx            # Card grille work
├── contexts/
│   └── action-bar-context.tsx      # État ActionBar : "nav" | "project"
├── sanity/
│   ├── client.ts · env.ts · queries.ts
└── lib/
    ├── utils.ts                    # cn()
    └── sanity-utils.ts             # fileRefToUrl(), isVideoRef()
```

## Conventions

- Server components par défaut — `"use client"` uniquement si hooks/events/context
- Next.js 16 : `await params` avant tout autre `await` dans les pages
- ISR : `export const revalidate = 60` sur les pages data-fetching
- **Jamais de composant custom si shadcn en a un** — toujours vérifier d'abord
- Ajouter un composant shadcn : `pnpm dlx shadcn@latest add <component>`
- Icons : imports nommés depuis `@hugeicons/core-free-icons`
- Tailwind : pas de valeurs px en dur, mobile-first, couleurs via CSS variables

## Patterns clés

### Thumbnail Sanity
Les thumbnails sont de type `file` (pas `image`). Toujours utiliser :
```ts
import { fileRefToUrl, isVideoRef } from "@/lib/sanity-utils";
const url = fileRefToUrl(project.thumbnailRef);
```

### ActionBar
Deux modes : `"nav"` (par défaut) et `"project"` (page projet).
Pour passer en mode projet, placer dans la page :
```tsx
<ProjectPageClient title={project.title} redirectUrl={project.redirectUrl} />
```
Le cleanup (retour en mode nav) se fait automatiquement au unmount.

### Fetches Sanity typés
```ts
const projects = await client.fetch<ProjectListItem[]>(projectsListQuery);
const project  = await client.fetch<ProjectDetail | null>(projectDetailQuery, { slug });
```

### /play — DA « Prism » et scène persistante
- DA commune (loader, nav, side panel, curseur, éclats) : `src/lib/da.ts` — rectangles de verre
  translucides, dégradés, bords fondus, spectre pastel, coins lissés à 32 % (`CORNER_SMOOTHING`
  côté shaders, `--da-corner-k` côté CSS).
- La scène 3D vit dans le layout (`components/play/PlayHost.tsx`) : montée à la première visite de
  `/play`, puis gardée en vie (invisible, `frameloop="never"`) ; la page `/play` ne fait que lui passer
  les artifacts via `<PlayMount>`. `html[data-play]` active les curseurs 56px de `/public/cursors/lg`.
- Réglages visuels : `/play#debug`, 5 onglets (global : caméra + curseur ; media ; canvas : layout + fond de points ;
  style : select « prism » ; animation : survol / ouverture / carte suivante, avec inspecteur et rejeu).
  Le code vit dans `components/play/debug/`. `window.__play` expose l'état.
- Le curseur de /play est dessiné par `PlayCursor` (incliné selon le mouvement, grossit au survol, rétrécit au clic).

## Landing — page Notion (branche `production` uniquement)

Sur `production`, `/` n'est plus le redirect vers `/work` : c'est une page statique qui affiche la page Notion du
portfolio actuel en plein écran (iframe), avec un bouton « visit the wip site » vers
`https://staging.aurelienlouvel.space` (le domaine du staging). Le bouton est dans une pastille fixée en haut à
droite (`fixed right-0 top-0`), collée au coin, sans marge : seul son coin bas gauche est arrondi. Elle recouvre
volontairement les contrôles que Notion affiche lui-même à cet endroit (« ··· » et « Get Notion free »).

- `src/app/page.tsx` : la landing. `NOTION_EMBED_URL` est le lien d'embed de la page Notion publiée
  (`https://<workspace>.notion.site/ebd/<id>`), tel que fourni par Notion.
- SEO : pas de `metadata` dans la page, on garde celui du layout (titre, description, icônes), identique au staging.
- DA : la page fixe `--da-corner-k: 1.16` (≈ 10 % de lissage), donc des coins `corner-shape: superellipse(1.16)`
  via la règle globale de `globals.css`. Échelle : k = 1 + lissage / 0.6, soit 1 = arc de cercle (0 %), 1.33 ≈ 20 %
  (celui de /play), 1.53 ≈ 32 % (le repli de la feuille de style).
- `next.config.ts` : toute autre page redirige (307) vers `/` ; `_next`, `_vercel` et les fichiers (extension)
  restent servis. Les routes WIP (`/work`, `/play`, `/info`, `/api`) ne sont donc pas exposées.
- `ActionBar` se masque sur `/`.
- C'est le seul écart entre `production` et `staging`, limité à ces fichiers (chemins depuis la racine du repo) :
  `nextjs-app/src/app/page.tsx`, `nextjs-app/src/components/nav/ActionBar.tsx`, le bloc `redirects()` de
  `nextjs-app/next.config.ts` et cette section de `nextjs-app/CLAUDE.md`. Ils ne remontent jamais vers `staging`.
  Pour lancer le nouveau site (la landing disparaît), voir « Branches & déploiement » dans le `CLAUDE.md` racine.
