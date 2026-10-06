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

### /play — DA « Pixels » et scène persistante
- DA commune (loader, nav, side panel, curseur, éclats) : `src/lib/da.ts` — des carrés unis et rien d'autre :
  une couleur par pixel, ni flou, ni verre translucide, ni bord fondu ; un pixel éteint est blanc. Tous ont
  de légers coins arrondis (`DA_RADIUS` côté JS et shaders, `--da-radius` côté CSS ; réglable). Le dégradé
  naît entre pixels voisins (`daGradientAt` : une fenêtre `DA_WINDOW` du spectre pastel à la fois, jamais
  tout le spectre). Ce que la DA anime : la pastille « play » de la nav est un champ de pixels de 0.5rem
  (`--da-cell`), en partie de couleur (le dégradé), en partie d'un gris pâle, à peine visible, qui fait le
  fond ; la vague de survol allume d'autres pixels de couleur puis les éteint ; au survol d'une carte, une
  bande blanche lumineuse la traverse (`ArtifactPlane`, réglage `waveGlow`) ; les pixels du coin bas droit
  du panneau (`PanelPixels`, taille `panelPixelSize`, nombre `panelPixelDensity` : 36 par défaut, 137 à pleine densité) scintillent
  en continu. Les couleurs du panneau viennent de la page ouverte, pas du spectre de la DA :
  `usePanelGradient` (`panel-gradient.ts`) mélange la palette des médias (`lib/dominant-color.ts`) selon le
  poids de chaque carte du deck, pour le halo derrière le panneau et, par `--pg-c0/1/2`, pour ses pixels (le
  rose, le lilas et le ciel de la DA ne servent que de repli ; `panelGradientIrid` ajoute de l'irisation au
  halo, 0 par défaut). Les éclats d'ouverture sont des carrés d'une couleur (celle de leur morceau d'image,
  ou le dégradé de la DA avec `tint`). Les coins des cartes restent lissés (`CORNER_SMOOTHING` côté shaders,
  `--da-corner-k` côté CSS). Réglages dans `/play#debug` › Style › « Pixels et degrades » : les valeurs déjà
  enregistrées par le navigateur passent avant les défauts, d'où le bouton Reset.
- Dézoom de la caméra en mouvement : lié au retard de la caméra sur sa cible
  (`components/play/camera-dezoom.ts`), pas à une vitesse lissée à part : un lissage de plus sur le zoom
  réintroduirait une animation de fin sur un canvas déjà statique. Au drag et à la molette, le zoom pivote
  autour du pointeur (`dezoomAnchor`) ; réglages dans `/play#debug` › Global › Dezoom en mouvement.
- La scène 3D vit dans le layout (`components/play/PlayHost.tsx`) : montée à la première visite de
  `/play`, puis gardée en vie (invisible, `frameloop="never"`) ; la page `/play` ne fait que lui passer
  les artifacts via `<PlayMount>`. `html[data-play]` n'active les curseurs SVG de `/public/cursors`
  (`globals.css`) que sur `/play` : partout ailleurs, curseur système.
- Empilement des cartes : au seul `renderOrder`, jamais à la profondeur. Les matériaux des cartes (mosaïque,
  deck) n'ont ni `depthTest` ni `depthWrite`, et `applyCardTilt` reste un warp 2D (z = 0) : un z réel
  ferait se découper deux cartes inclinées voisines. Ordre : ombres des cartes −10 · mosaïque 0 · tuile qui
  s'ouvre 10 · vague de sélection 20 · deck `100 − d·10` (≈ 65 à 110 avec `stackDepth` à 3) · carte qui revient
  200 · éclats 300. Toute nouvelle couche prend une valeur dans cet ordre.
- Canvas : fond de points CSS (`updateBackgroundDots`), cartes à plat (`plane.rotationRange` et `hover.rotate`
  à 0) et ombre portée douce (`components/play/CardShadow.tsx`) pour les détacher des points. L'ombre est un
  quad SDF enfant du mesh de la carte : elle hérite de sa position, relit sa taille à chaque frame, s'efface
  avec la mosaïque à l'ouverture d'une carte et n'existe pas sur le deck. Son `raycast` est neutralisé : R3F
  teste aussi les enfants d'un mesh à écouteurs, et une ombre plus grande que la carte élargirait le survol.
- Réglages visuels : `/play#debug`, 5 onglets (global : caméra + curseur ; media ; canvas : layout + fond de points
  + ombre ; style : select « prism » ; animation : survol / ouverture / carte suivante, avec inspecteur et rejeu).
  Le code vit dans `components/play/debug/`. `window.__play` expose l'état.
- Le curseur de /play est dessiné par `PlayCursor` (incliné selon la vitesse du pointeur par un ressort
  amorti sans retard, grossit au survol, rétrécit au clic). Il est rendu en portail dans `<body>` : la
  surface de /play est un contexte d'empilement, un curseur placé dedans passerait sous l'ActionBar.
