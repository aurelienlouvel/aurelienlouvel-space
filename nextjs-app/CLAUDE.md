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
- Retour de l'ouverture d'une carte (Échap ou bouton retour de la barre) : seule la carte du dessus de la pile
  à cet instant est gardée, et c'est elle qui se pose à la place de la tuile, là où elle en est (sa traction se
  relâche par `rewindPullRelease` : 0 = d'un coup, 8 par défaut) ; les autres cartes et le panneau s'effacent
  vite (`rewindLayerFade`). Quand ce n'est pas le premier média du projet, elle devient la couverture de la
  tuile (`TileCover`, `covers` dans `PlayCanvas.tsx`, gardée tant que la page n'est pas rechargée) : la tuile
  montre ce média rogné à son format comme `object-fit: cover` (`uMapScale` du shader, `setCoverScale` de
  `rounded-frame.ts`), et rouvrir le projet démarre la pile sur cette carte (`startPlayback(…, startDeck)`),
  avec des éclats d'ouverture rognés pareil (`ShardSource.mapRatio`). Partir sur le premier média redonne sa
  tuile d'origine : la couverture précédente s'efface (`onKeepCover(null)`). Le choix se fait une fois par
  retour, à sa première image (`coverDecidedRef`), et suppose la texture déjà chargée (`getSharedTexture`) :
  sinon, ou si `rewindKeepCover` est décoché, on retombe sur l'ancien retour où la carte se fond en douceur
  dans la tuile sans la remplacer (`keepOther`, `rewindLandMix`). Un second Échap en plein retour repart de
  l'état courant, sans rien dérouler. Deux façons (`rewindMode`) : « clean » (par défaut) fait glisser chaque
  grandeur (caméra, carte, mosaïque) vers son repos, avec un décalage réglable (`rewindStagger`) ; « film »
  rejoue l'ouverture à l'envers (`rewindCalm` étouffe la vague, la torsion et les éclats qui reviendraient,
  1 = aucun). Durée et courbe : `rewindDuration`, `rewindEasing` (onglet Animation › « 7 Retour »). Pendant
  qu'un projet est ouvert, les cartes derrière celle du dessus sont désaturées (`stackSaturation`, 0.45 ;
  1 = couleurs d'origine).
- Fin du tortillement de la carte (après la vague d'ouverture) : elle revient à plat par un retour doux et
  non d'un coup (`twistSettleStart`, `twistSettle`, `twistSettleEasing`, onglet Animation › « 4 Vague » ;
  `transition-presets.ts`).
- Arrivée de la carte (juste avant qu'elle se pose) : dès que le pack est chargé, la caméra recule d'un cran
  puis revient vers le cadrage de la vue détail (`arrivalDip`, 0.22 : la part du zoom perdue au creux ;
  0 = l'ancienne trajectoire, à l'identique). Le creux tombe exactement quand la piste `dezoom` démarre et le
  zoom finit sur `detailZoom`, comme avant. Pack déjà chargé avant le hold : le recul part du hold. Pack
  chargé pendant le hold : il part à ce moment, et comme la vague de chargement finit son cycle avant de
  traverser, `advanceClock` (`PlayCanvas.tsx`) compte le temps écoulé (`arrivalWait`) et celui qu'il reste
  (`arrivalSpan`) pour qu'`arrivalBounds` (`transition-presets.ts`) étire la fenêtre d'autant : pas de palier
  au creux. `arrivalStart` retarde le départ (borné à 60 % de la fenêtre, au-delà le recul se réduirait à un
  à-coup), `arrivalEasing` règle la courbe (`easeInOutCubic`, doux aux deux bouts). Ignoré pendant un retour
  (rewind). Avec les préréglages dont `approachZoom` dépasse `detailZoom`, il n'y a pas de remontée : le
  recul ne fait qu'avancer et raidir la descente (le zoom ne remonte que si le creux passe sous
  `detailZoom`, comme avec la config par défaut). Réglages : Animation › « 5 Cascade et cadrage » ›
  « Arrivee (recul puis zoom) » ; le calcul est dans `samplePlaying` (`transition-timeline.ts`).
- Punch d'arrivée (la carte se pose et les layers descendent de derrière elle) : toute la pile gonfle d'un
  facteur `1 + frame.punch` autour du centre de la carte du dessus, puis retombe, pendant la fenêtre `lock` qui
  suit la vague (`lockScalePunch`, 0.14 = +14 % au pic, 0.18 et 0.2 avec les préréglages snappy et dramatic,
  0 = aucun punch ; `lockPunchAttack`, 0.22 : la part de la piste `lock` passée à monter, petit = coup sec). Ce
  facteur est à part de `tileScale` (le gonflement de la tuile pendant le chargement) et s'applique à toutes les
  cartes à l'affichage (`SecondaryGalleryPlanes.tsx`) : `deckTop` l'inclut. Les layers naissent centrés derrière
  la carte et descendent à leur place pendant l'ouverture (`stackDrop`, 1 ; 0 = depuis le bord bas de la carte,
  l'ancien trajet). Mesuré en 1440 × 900 : la carte passe de 660 à 767 puis 684 px à l'écran. Dans une mise en
  page où elle rétrécit pendant l'ouverture (mobile : la tuile prend presque toute la largeur), le punch ne fait
  que ralentir ce rétrécissement. Réglages : Animation › « 5 Cascade et cadrage » (`lockScalePunch`,
  `lockPunchAttack`) et dossier « Layers » (`stackDrop`) ; l'inspecteur a un canal « punch ».
- Pastille du nombre de médias (au survol d'une carte, en haut à droite) : `mediaCount`, le nombre de médias
  utilisables de la galerie (images avec fichier, vidéos avec fichier ou url : le même compte que les cartes de
  la pile), arrive avec la liste chargée par `/play` (`playArtifactsQuery`, `PlayArtifact`) ; `PlayCanvas` le passe
  en `counts`, indexé comme `LayoutPoint.artifactIndex`. `HoverCountPill` est un nœud DOM de la surface, sans
  état React, que `HoverCountDriver` (dans le Canvas, monté après la mosaïque) déplace à chaque frame : il projette
  le coin haut droit de la carte survolée avec la caméra de cette frame (grossissement de survol, rotation de
  repos, retrait `countInset`, 8 px de marge au bord de l'écran) et écrit position, opacité et texte dans le DOM.
  Elle ne glisse jamais d'une carte à l'autre : en changeant de carte elle s'efface sur place, puis la suivante
  apparaît ; quand le pointeur quitte la carte, elle reste accrochée à son coin le temps de s'effacer. Pas pendant
  l'ouverture d'une carte ; « Rejouer le survol » (debug) l'affiche sur la carte sélectionnée. Un projet à un seul
  média affiche « 1 » : `countMin` la réserve aux projets de N médias ou plus. Elle ignore le fisheye et
  l'inclinaison de la tuile, et n'est pas filtrée sur tactile (un toucher la fait apparaître un instant, comme la
  vague de survol). Réglages : Animation › « Survol » › « Pastille medias » (`hover.countOpacity`, 0 = masquée ;
  `countMin`, `countInset`, `countScale`, `countSpeed`).
- Défilement du deck (carte suivante) : le geste est signé et la carte part du côté où on la tire. La molette,
  le drag et les flèches tirent un vecteur (`deckPullVec`, axes du monde : x à droite, y en haut, en cartes) et
  la carte passe quand sa longueur atteint 1 (`stepDeckPull`, `PlayCanvas.tsx`). Tant qu'elle n'est pas
  passée, le geste se garde : on peut défiler vers le haut puis vers le bas, le vecteur revient vers zéro et la
  carte revient avec lui (`deckRelease` à 0 : elle reste où on l'a laissée ; au-dessus de 0 elle retombe d'elle-même
  après `deckHold`). Une fois passée, il n'y a plus de retour en arrière : le deck tourne en boucle, toujours
  vers l'avant. Elle part de tous les côtés, comme le contenu qu'on fait défiler : la molette vers le bas la
  fait monter, vers la droite la fait partir à gauche ; le drag la suit au doigt ; une flèche vaut un défilement
  dans son sens (↓ la monte, → la pousse à gauche). `deckInvertX` et `deckInvertY` inversent chaque axe pour la
  molette, le drag et les flèches à la fois. La molette ne tire que sur son axe dominant (`DECK_AXIS_LOCK`,
  2.5) : un geste de trackpad un peu de travers ne part pas en diagonale. Le curseur ne fait que courber la
  trajectoire de part et d'autre de la direction du geste (`deckAimMix`, 0.8, 39° au plus ; `SecondaryGalleryPlanes.tsx`),
  sans courbure pendant un drag, où la carte suit le doigt ; le cap est figé au changement de carte
  (`deckAimCommit`) et la carte part de là où la traction l'a laissée (`deckLeaveFrom`), donc d'à plat quand
  rien ne l'a tirée, au clavier.
- Pile de cartes en boucle : la carte du dessus et `stackDepth` layers dessous (2 par défaut, donc trois cartes
  visibles ; 6 au plus, `STACK_DEPTH_MAX`), même quand le projet n'a qu'un ou deux médias : la même carte revient
  alors derrière elle-même. Le deck parcourt un anneau de cases (`components/play/deck-ring.ts`, sans three ni
  React, donc testable hors navigateur) : la case s montre toujours le média `s mod K` et l'anneau compte un
  multiple de K cases, au moins `2 × STACK_DEPTH_MAX + 4` (16 pour 1 ou 2 médias, 18 pour 3, 20 pour 5). La
  case qui passe de la tête de la pile à son fond le fait hors de vue (profondeur ≥ `stackDepth` + 1, donc
  opacité 0), et revient en fondu sur un pas à mesure que la pile avance. Un média peut donc occuper plusieurs
  cases : une seule est « principale » (celle de la tuile à l'ouverture, celle du dessus au retour, `keptSlot`),
  les autres s'effacent avec le reste de la pile, et le poids d'un média pour le dégradé du panneau est le plus
  fort de ses cases. Les images ne se chargent qu'une fois par url (`pendingImageLoads`), les vidéos partagent
  déjà leur texture. Le dernier layer garde son opacité entière (`layerOpacityAt`), au-delà la carte s'efface
  sur un pas.
- Rotation 3D de la pile (vue détail, `SecondaryGalleryPlanes.tsx`) : toute la pile est un groupe three qui
  pivote autour du centre de la carte du dessus selon la position de la souris, le côté du curseur reculant
  (`deckTilt`, 7° au plus ; négatif = l'inverse, 0 = à plat). Deux groupes imbriqués (l'extérieur pivote, l'intérieur
  ramène l'origine au monde) : les cartes gardent leurs coordonnées monde, donc `deckTop`, `deckFx` et la
  traction restent exprimés hors rotation (les éclats et l'origine des pixels de fond ne suivent pas la
  rotation, d'environ 2 px à 7°). Chaque layer recule en z (`stackDepthZ`, 80 px écran, borné à 140 unités
  monde) : c'est cet écart qui fait la parallaxe, un layer de plus se décale d'environ `stackDepthZ × sin(rotation)`.
  L'empilement visible reste celui de `renderOrder` (pas de test de profondeur). La caméra est orthographique :
  chaque carte reçoit en plus la même inclinaison dans son shader (`uCardTilt`, `applyCardTilt` de
  `rounded-frame.ts`) pour avoir une perspective, réglée par `stackPerspective` (0 = rotation sans trapèze,
  1 = naturelle). Le groupe et le warp tournent dans le même ordre (X puis Y, Euler « YXZ ») et le même sens.
  `deckTiltLayerGain` ajoute une inclinaison propre aux layers profonds (0 : ils suivent le groupe, rigides).
  La rotation suit le pointeur dès qu'il a bougé sur /play (`runtime.pointer.seen`), se lisse
  (`deckTiltSmooth`) et revient à plat pendant le retour ; la pile masquée repart de zéro. Réglages :
  Animation › « Carte suivante » › « Rotation 3D de la pile (souris) ».
- Dézoom de la caméra en mouvement : lié au retard de la caméra sur sa cible
  (`components/play/camera-dezoom.ts`), pas à une vitesse lissée à part : un lissage de plus sur le zoom
  réintroduirait une animation de fin sur un canvas déjà statique. Au drag et à la molette, le zoom pivote
  autour du pointeur (`dezoomAnchor`) ; réglages dans `/play#debug` › Global › Dezoom en mouvement.
- La scène 3D vit dans le layout (`components/play/PlayHost.tsx`) : montée à la première visite de
  `/play`, puis gardée en vie (invisible, `frameloop="never"`) ; la page `/play` ne fait que lui passer
  les artifacts via `<PlayMount>`. `html[data-play]` n'active les curseurs SVG de `/public/cursors`
  (`globals.css`) que sur `/play` : partout ailleurs, curseur système.
- Apparition et disparition de la page : la scène vit dans le layout, elle ne passe donc pas par les
  `<ViewTransition>` des autres pages ; la surface (`#play-surface`) s'anime elle-même, par des transitions CSS
  (`globals.css`) que pilote `data-presence`, posé par `PlayCanvas` : « in » (page affichée), « out » (sortie en
  cours : la scène est encore rendue, la surface n'est plus cliquable) et « off » (masquée, `frameloop="never"`).
  À l'entrée, un léger zoom (de `1 − zoom` à 1) avec un fondu ; à la sortie, un léger dézoom avec un fondu par-dessus
  la page qui arrive, déjà cliquable. Même courbe que les autres pages (`--view-transition-ease`) ; `visibility` ne
  bascule qu'à la fin de la sortie. `shown`, l'état qui commande le rendu et la remise à zéro de la scène, suit
  `active` à l'ouverture et le retarde à la fermeture (`exitMs` + `PAGE_EXIT_MARGIN_MS`, 80 ms ; le minuteur est
  annulé si l'on revient) : la phase, la caméra, le projet ouvert et le panneau ne se remettent à zéro qu'une fois
  la page disparue, et un retour en pleine sortie retrouve la scène telle qu'on l'a quittée (la transition CSS
  repart de sa valeur courante). Le curseur, sa traînée et la barre de projet suivent la route (`active`), pas la
  sortie. Rien ne retient la page quittée (pas de `<ViewTransition>` sur `/play`) : elle disparaît d'un coup, donc
  à l'entrée la surface apparaît en fondu sur du blanc (la première visite aussi, voir `@starting-style` plus bas) ;
  à la sortie, la scène continue de tourner pendant le fondu et un projet ouvert reste tel quel.
  Réglages : Global › « Transition de page » (`page.enterMs` 650, `page.exitMs` 650, `page.zoom` 0.04 ; 0 =
  instantané, et 0 pour le zoom = fondu seul), lus à chaque changement de route : un réglage agit à la navigation
  suivante, et ce groupe, nouveau, n'a pas demandé de nouvelle `STORAGE_KEY`. `prefers-reduced-motion` ramène durées
  et zoom à 0 (lu à chaque navigation). `PlayCanvas` les pose en variables CSS (`--play-enter-ms`,
  `--play-exit-ms`, `--play-page-scale`) sur `<html>`, dont la surface hérite, dans un `useInsertionEffect`, pas dans
  un effet de layout : la durée d'une transition CSS est celle du premier calcul de style qui voit `data-presence`
  changer, et l'effet de layout du Canvas, un enfant, peut le forcer avant le nôtre (la transition partait alors avec
  les valeurs de la navigation précédente). Sur `<html>` et non sur la surface, parce qu'à la première visite elle
  naît dans ce même commit, déjà à l'état « in » : il n'y a alors aucun changement d'état à animer, et c'est
  `@starting-style` (`globals.css` : départ à `opacity: 0` et `scale(1 − zoom)`) qui joue l'entrée ; son premier
  calcul de style doit déjà trouver les variables. Les valeurs par défaut sont les replis des `var(…)` de
  `globals.css` (650 ms, 0.96). À l'état « in », la surface n'a pas de `transform` (`none`, pas `scale(1)`) : un
  `transform` permanent ferait d'elle le bloc conteneur de ses descendants `fixed`.
- Empilement des cartes : au seul `renderOrder`, jamais à la profondeur. Les matériaux des cartes (mosaïque,
  deck) n'ont ni `depthTest` ni `depthWrite`, et `applyCardTilt` reste un warp 2D (z = 0) : un z réel
  ferait se découper deux cartes inclinées voisines. Ordre : contour de chaque carte = le rang de sa carte
  − 0.5 (donc juste sous elle) · mosaïque 0 · tuile qui s'ouvre 10 · vague de sélection 20 · pixels de fond
  50 (`AMBIENT_RENDER_ORDER`) · deck `100 − d·10` (≈ 65 à 110 avec `stackDepth` à 2 ; au-delà de 4 layers, les
  plus profonds passent sous les pixels de fond, à une opacité déjà quasi nulle) · carte qui revient 200 ·
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
