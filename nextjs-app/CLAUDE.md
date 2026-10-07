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

### Copyright (`SiteFooter`)
`components/layout/SiteFooter.tsx` : « © 2026. Aurélien Louvel » en bas à gauche et « All Rights Reserved » en bas à
droite, sur une ligne (année écrite en dur), dernier élément des pages qui défilent (work, projet, info), posé après le
`<main>` dans le `PageShell` (sinon ce n'est plus un repère `contentinfo`). Il porte la marge basse qui dégage la fin de
page de l'ActionBar flottante (`pb-36` : elle couvre 3 à 7 rem au-dessus du bas de l'écran) : une nouvelle page qui
défile n'ajoute pas son propre `pb-*` et finit par `<SiteFooter />`. Pas sur /play (rien à faire défiler) ni dans le
layout racine.

### Fetches Sanity typés
```ts
const projects = await client.fetch<ProjectListItem[]>(projectsListQuery);
const project  = await client.fetch<ProjectDetail | null>(projectDetailQuery, { slug });
```

### /play — DA « Pixels » et scène persistante
- DA commune (loader, nav, side panel, curseur, éclats) : `src/lib/da.ts` — des carrés unis et rien d'autre :
  une couleur par pixel, ni flou, ni verre translucide, ni bord fondu ; un pixel éteint est blanc. Coins à
  peine adoucis par défaut, 0.16 du côté (`DA_RADIUS` côté JS et shaders, `--da-radius: 16%` côté CSS,
  `da.pixelRadius` dans le debug : le curseur « coins arrondis » va de 0, carré net, à 0.5, rond). Le dégradé
  naît entre pixels voisins (`daGradientAt` : une fenêtre `DA_WINDOW` du spectre pastel à la fois, jamais
  tout le spectre).
  Ce que la DA anime :
  - la pastille « play » de la nav et le loader sont des champs de pixels très peu opaques, irisés : chaque
    pixel a le reflet de la vague de survol des cartes d'après sa place (`daIrid`, le même cosinus pastel que
    le shader d'`ArtifactPlane`), que `da.navIrid` et `da.loaderIrid` mêlent au gris neutre `rgb(24 24 27)`
    (1 = le reflet, 0 = gris). Ces reflets sont plus clairs que le gris et pèsent environ trois fois moins
    à opacité égale : `daIridGain` (jusqu'à `DA_IRID_GAIN`, 2) rend à l'opacité ce qu'ils perdent, sans
    les rendre opaques. Sur la pastille (`nav/PlayPillPixels.tsx`, cases de 0.5rem, `--da-cell`), un champ
    dérive doucement quand la page est active et la vague de survol (`da-cell-wave`) allume puis éteint les
    pixels de gauche à droite ; `da.navWave` règle sa force, `da.navRest` celle du fond au repos.
  - le loader (`PlayLoader`) est cette même vague à l'échelle de la page : une grille de pixels irisés sur
    tout l'écran que la vague balaie en boucle (`ld-wave`, CSS pur ; `da.loaderStrength` règle sa force)
    jusqu'à ce que la scène soit prête (`isReady`), puis fondu. Ni barre, ni pourcentage. Il n'existe que
    pendant le chargement : recharger la page pour le revoir après un réglage.
  - au survol d'une carte, une bande blanche lumineuse la traverse (`ArtifactPlane`, réglage `waveGlow`) ;
    `waveIrid` la teinte d'un reflet irisé (0 = blanc pur, 1 = arc-en-ciel ; 0.5 par défaut).
  - les pixels du coin bas droit du panneau (`PanelPixels`) forment une forme tramée dans une grille de
    12 × 8 cases : un quart d'ellipse dense au coin, comparé à une matrice de Bayer, donc des pixels bien
    répartis plutôt qu'agglutinés. Gros et peu nombreux (≈ 22 allumés en moyenne à la densité par défaut,
    36 cases au plus). Les cases ne bougent jamais ; ce sont leur nombre et leurs couleurs qui vivent, par
    une boucle `requestAnimationFrame` qui écrit l'opacité et la couleur de chaque case seulement quand la
    valeur change (`pixelFrame`, `pixelRgb`) : le nombre monte et descend par une onde de densité partie
    du coin (`panelPixelFlux`, `panelPixelFluxPeriod`, `panelPixelRipple`), les couleurs glissent le long
    de la palette de la page (`panelPixelShift`, `panelPixelShiftPeriod`) et l'opacité respire
    (`panelPixelPulse`, `panelPixelPeriod`). Des cycles de 5 à 7 s, assez vifs pour se voir d'un coup
    d'œil (≈ 6 pixels qui naissent ou s'éteignent par seconde sur le champ entier) mais jamais de
    scintillement, puisque chaque case suit l'onde du coin avec son retard ; avec
    `prefers-reduced-motion` le champ reste figé à sa forme moyenne. Autres réglages : `panelPixelSize`,
    `panelPixelDensity`.
  - tant qu'un projet est ouvert, quelques pixels très discrets dérivent derrière la pile et donnent une
    atmosphère (`ShardField` en mode ambiant ; onglet Animation › « 8 Pixels de fond » : nombre, opacité,
    taille, dérive, vitesse, fondu). Ils démarrent quand la pile est en place, prennent les couleurs de la
    carte du dessus et s'effacent au retour. Leur rang, `AMBIENT_RENDER_ORDER` (50), les place devant la
    mosaïque et derrière toute la pile.
  Les couleurs du panneau viennent de la page ouverte, pas du spectre de la DA : `usePanelGradient`
  (`panel-gradient.ts`) mélange la palette des médias (`lib/dominant-color.ts`) selon le poids de chaque
  carte du deck, pour le halo derrière le panneau et, par `paletteRef` (réécrit à chaque image), pour ses
  pixels (le rose, le lilas et le ciel de la DA, `PANEL_FALLBACK`, ne servent que de repli ;
  `panelGradientIrid` ajoute de l'irisation au halo, 0 par défaut). Les éclats d'ouverture sont des carrés
  d'une couleur (celle de leur morceau d'image, ou le dégradé de la DA avec `tint`). Les coins des cartes
  restent lissés (`CORNER_SMOOTHING` côté shaders, `--da-corner-k` côté CSS). Réglages dans `/play#debug` ›
  Style › « Pixels et degrades » : les valeurs déjà enregistrées par le navigateur passent avant les
  défauts, d'où `STORAGE_KEY` (`PlayDebug.tsx`), qu'on incrémente quand les défauts d'un réglage existant
  changent exprès (un réglage nouveau n'en a pas besoin), et le bouton Reset.
- Retour de l'ouverture d'une carte (Échap ou bouton retour de la barre) : seul le média en cours de la pile est
  gardé ; les autres cartes et le panneau s'effacent vite (`rewindLayerFade`) et ce média revient dans la
  mosaïque. Quand ce n'est pas le premier média du projet, il se fond en douceur dans la carte de la
  mosaïque (`keepOther`, `rewindLandMix`). Un second Échap en plein retour repart de l'état courant, sans
  rien dérouler. Deux façons (`rewindMode`) : « clean » (par défaut) fait glisser chaque grandeur (caméra,
  carte, mosaïque) vers son repos, avec un décalage réglable (`rewindStagger`) ; « film » rejoue l'ouverture
  à l'envers (`rewindCalm` étouffe la vague, la torsion et les éclats qui reviendraient, 1 = aucun). Durée et
  courbe : `rewindDuration`, `rewindEasing` (onglet Animation › « 7 Retour »). Pendant qu'un projet est
  ouvert, les cartes derrière celle du dessus sont désaturées (`stackSaturation`, 0.45 ; 1 = couleurs
  d'origine).
- Fin du tortillement de la carte (après la vague d'ouverture) : elle revient à plat par un retour doux et
  non d'un coup (`twistSettleStart`, `twistSettle`, `twistSettleEasing`, `twistSettleBlend`, onglet
  Animation › « 4 Vague » ; `transition-presets.ts`). La carte du deck n'est plus inclinée par la souris au
  repos (`deckTilt` à 0 ; le réglage reste dans le debug).
- Défilement du deck (carte suivante) : tout geste de scroll compte, dans un sens comme dans l'autre, comme un
  cran vers la carte suivante : la molette et le drag cumulent leur valeur absolue (`stepDeckPull`,
  `PlayCanvas.tsx`), le deck tourne en boucle et ne recule jamais, et au clavier toutes les flèches avancent.
  La carte part toujours vers le haut : le curseur (ou le doigt, au drag) ne règle que le côté et
  l'inclinaison de sa trajectoire, jamais le sens vertical, même sous la carte (`deckAimMix`, 0.8, la
  ramène d'autant vers « tout droit » ; `SecondaryGalleryPlanes.tsx`), et son cap est figé au changement de
  carte (`deckAimCommit`). Au clavier, rien pour viser : la carte part tout droit (`deckAimCommit` remis à
  (0, 1)).
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
  ferait se découper deux cartes inclinées voisines. Ordre : contour de chaque carte = le rang de sa carte
  − 0.5 (donc juste sous elle) · mosaïque 0 · tuile qui s'ouvre 10 · vague de sélection 20 · pixels de fond
  50 (`AMBIENT_RENDER_ORDER`) · deck `100 − d·10` (≈ 65 à 110 avec `stackDepth` à 3) · carte qui revient 200 ·
  éclats 300. Toute nouvelle couche prend une valeur dans cet ordre. Un champ d'éclats, lui, se pose en
  `groupOrder` sur son groupe, pas en `renderOrder` sur ses meshes : three trie d'abord par le rang du
  groupe le plus proche, et ce rang l'emporte sur celui des enfants.
- Canvas : fond de points CSS (`updateBackgroundDots`), cartes presque à plat (`plane.rotationRange` à 1.5°,
  `hover.rotate` à 0) et contour (`components/play/CardShadow.tsx`) pour les détacher des points. C'est
  l'ancienne ombre portée, devenue un liseré net, comme le plastique qui entoure une carte ; il suit toutes
  les cartes, mosaïque et deck, avant comme après l'ouverture. C'est un quad SDF enfant du mesh de la
  carte : il hérite de sa position, relit sa taille à chaque frame et suit l'opacité de sa carte (celle des
  cartes du fond du deck, réduites par `stackOpacity`, comprise). Son `raycast` est neutralisé : R3F teste
  aussi les enfants d'un mesh à écouteurs, et un contour plus grand que la carte élargirait le survol. Les
  réglages (`shadow.*`) sont dans l'onglet Media › « Contour (ombre) », plus dans canvas.
- Réglages visuels : `/play#debug`, 5 onglets (global : caméra + curseur ; media : dimensions, forme +
  contour (ombre) ; canvas : layout + fond de points ; style : select « prism » ; animation : survol /
  ouverture / carte suivante, avec inspecteur et rejeu). Le code vit dans `components/play/debug/`.
  `window.__play` expose l'état. Le panneau fait 620 px de large (`PlayDebug.tsx`) et les libellés passent à
  la ligne au lieu d'être coupés par « … » (`#leva__root label`, `globals.css` : plusieurs dépassent
  500 px) : un nouveau réglage peut garder un libellé explicite, sans l'abréger.
- Le curseur de /play est dessiné par `PlayCursor` (incliné selon la vitesse du pointeur par un ressort
  amorti sans retard, grossit au survol, rétrécit au clic). Il est rendu en portail dans `<body>` : la
  surface de /play est un contexte d'empilement, un curseur placé dedans passerait sous l'ActionBar.
