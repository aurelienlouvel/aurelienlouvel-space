/**
 * Pont entre la timeline de transition et Theatre.js.
 *
 * Tout ce qui est animé pendant la phase `playing` transite déjà par les 16
 * champs scalaires d'un `TransitionFrame`. Ce module expose ces 16 champs comme
 * un objet Theatre : la mosaïque, la caméra, la colonne et les shaders ne
 * bougent pas d'une ligne, on remplace seulement *qui* produit les nombres.
 *
 * ## Le principe : surcharge piste par piste
 *
 * Une piste que tu n'as pas touchée dans l'éditeur garde **exactement** la
 * chorégraphie codée dans `transition-timeline.ts`. Dès que tu poses au moins
 * une keyframe sur une piste (clic droit sur la propriété → « Sequence »),
 * Theatre prend la main sur cette piste-là, et elle seule.
 *
 * Conséquences voulues :
 * - tant que rien n'est écrit, la transition est rigoureusement identique à
 *   aujourd'hui — aucune régression possible ;
 * - pas d'écran blanc au démarrage (une feuille Theatre vierge sans keyframes
 *   rendrait la transition statique) ;
 * - on peut réécrire une seule piste (le zoom, par exemple) et laisser le code
 *   gérer les quinze autres.
 *
 * ## Ce qui reste hors de portée de l'éditeur
 *
 * Seule la phase `playing` est pilotable. Le hold (`selecting`) est conduit par
 * l'utilisateur — sa durée lui appartient, il n'a pas d'horloge — et `idle` /
 * `isolated` / `returning` ne sont pas des timelines temporelles.
 *
 * ## La tête de lecture
 *
 * Elle a un propriétaire, jamais deux. Hors scrub, c'est l'appli : on recopie
 * `t` dans `sequence.position` pour que la tête de l'éditeur suive la lecture.
 * En mode scrub, c'est Theatre : on lit `sequence.position` et on la renvoie
 * comme `t`, si bien que tirer la tête de lecture rejoue toute la transition —
 * pistes codées comprises. Sans ça on ne pourrait pas régler une easing : il
 * faudrait relancer la transition entière à chaque essai.
 *
 * ## Ouvrir l'éditeur
 *
 * `localhost:3000/play#keyframes` — page dédiée à l'édition, panneau de debug
 * masqué. À l'arrivée : la transition se lance automatiquement (sélection du
 * premier artefact, saut direct en phase `playing`), Theatre prend la main sur
 * la tête de lecture, et une première graine est posée (cf. `snapshotFrame`)
 * pour que le rendu de départ corresponde à l'existant. Il ne reste qu'à :
 * clic droit sur une propriété dans Theatre → « Sequence », poser des
 * keyframes, courber les easings au bézier, et lire/scruber depuis le
 * transport de Theatre — plus besoin de bouton côté appli.
 *
 * La petite barre en haut à gauche (`KeyframeEditorHud`) permet de rejouer
 * depuis le début (**Restart**) et de graver l'état courant dans les pistes
 * déjà séquencées, à la position de lecture actuelle (**Snapshot**) — pratique
 * pour poser rapidement une pose à un instant donné plutôt que de saisir 16
 * valeurs à la main.
 *
 * La timeline utile va de 0 à `timelineEnd(config)` — 4,6 s avec les réglages
 * par défaut.
 *
 * ## Workflow d'export
 *
 * L'éditeur sauvegarde en localStorage pendant que tu travailles. Pour figer :
 * dans le panneau Theatre, sélectionne le projet dans l'outline à gauche →
 * bouton « Export <projet> to JSON ». Remplace le contenu de
 * `play-transition-state.json` par le fichier téléchargé. C'est cet état-là qui
 * part en production ; le studio, lui, n'est jamais chargé hors développement.
 */

import { getProject, types, type ISheet, type ISheetObject } from "@theatre/core";
import type { IStudio } from "@theatre/studio";

import type { TransitionFrame } from "./transition-timeline";
import savedState from "./play-transition-state.json";

/** Intervalle de rafraîchissement du masque des pistes écrites, en ms (dev uniquement). */
const MASK_REFRESH_MS = 250;

const PROJECT_ID = "oré · play";
const SHEET_ID = "Transition";
const OBJECT_ID = "Frame";

/**
 * Les 16 grandeurs de `TransitionFrame`, exposées à l'éditeur.
 *
 * Les valeurs par défaut sont celles de l'état `idle` : elles ne servent qu'à
 * l'affichage d'une piste non séquencée, puisqu'une piste sans keyframe est
 * ignorée au profit du code. Les `range` cadrent les sliders de l'éditeur, ils
 * ne bornent pas les valeurs des keyframes.
 */
const FRAME_PROPS = {
  zoom: types.number(1, { range: [0, 6], nudgeMultiplier: 0.01, label: "Zoom" }),
  framing: types.number(0, { range: [0, 1], nudgeMultiplier: 0.01, label: "Framing" }),
  scatter: types.number(0, { range: [0, 4000], nudgeMultiplier: 5, label: "Scatter" }),
  mosaicOpacity: types.number(1, { range: [0, 1], nudgeMultiplier: 0.01, label: "Mosaic opacity" }),
  tileScale: types.number(1, { range: [0, 3], nudgeMultiplier: 0.005, label: "Tile scale" }),
  tileTiltX: types.number(0, { range: [-1.2, 1.2], nudgeMultiplier: 0.005, label: "Tile tilt X (rad)" }),
  tileTiltY: types.number(0, { range: [-1.2, 1.2], nudgeMultiplier: 0.005, label: "Tile tilt Y (rad)" }),
  tileRoll: types.number(0, { range: [-1.2, 1.2], nudgeMultiplier: 0.002, label: "Tile roll (rad)" }),
  reveal: types.number(0, { range: [0, 1], nudgeMultiplier: 0.01, label: "Reveal" }),
  scroll: types.number(0, { range: [0, 1], nudgeMultiplier: 0.01, label: "Scroll" }),
  slide: types.number(0, { range: [-1500, 1500], nudgeMultiplier: 5, label: "Slide" }),
  columnOpacity: types.number(0, { range: [0, 1], nudgeMultiplier: 0.01, label: "Column opacity" }),
  bracketPad: types.number(0, { range: [-120, 120], nudgeMultiplier: 0.5, label: "Bracket pad (px)" }),
  bracketAlpha: types.number(1, { range: [0, 1], nudgeMultiplier: 0.01, label: "Bracket alpha" }),
  overlayExit: types.number(0, { range: [0, 1], nudgeMultiplier: 0.01, label: "Overlay exit" }),
  textRevealed: types.boolean(false, { label: "Text revealed" }),
};

/** Clés surchargeables, dans l'ordre d'affichage de l'éditeur. */
const AUTHORABLE_KEYS = Object.keys(FRAME_PROPS) as (keyof TransitionFrame)[];

type Rig = {
  sheet: ISheet;
  object: ISheetObject<typeof FRAME_PROPS>;
  /** Pistes portant au moins une keyframe : Theatre y a la priorité sur le code. */
  authored: Set<keyof TransitionFrame>;
};

let rig: Rig | null = null;
let lastMaskCheck = -Infinity;

/**
 * Crée (une seule fois) le projet, la feuille et l'objet Theatre.
 *
 * Renvoie `null` côté serveur : `@theatre/core` touche au DOM et la transition
 * n'existe que dans le canvas client.
 */
export function getTransitionRig(): Rig | null {
  if (rig) return rig;
  if (typeof window === "undefined") return null;

  // Un état vide (le fichier livré tant que rien n'a été exporté) ferait
  // échouer la validation de Theatre : on ne le passe qu'une fois rempli.
  const hasSavedState = Object.keys(savedState as object).length > 0;
  const project = getProject(
    PROJECT_ID,
    hasSavedState ? { state: savedState } : undefined,
  );

  const sheet = project.sheet(SHEET_ID);
  const object = sheet.object(OBJECT_ID, FRAME_PROPS);

  rig = { sheet, object, authored: new Set() };

  // L'état arrive de façon asynchrone : le masque n'est fiable qu'après `ready`.
  // En développement il sera de toute façon rafraîchi en continu.
  void project.ready.then(() => refreshAuthoredMask());

  return rig;
}

/**
 * Recalcule quelles pistes portent des keyframes.
 *
 * Appelé une fois en production (l'état est figé) et périodiquement en
 * développement, pour que poser une première keyframe dans l'éditeur bascule la
 * piste immédiatement, sans rechargement.
 */
function refreshAuthoredMask() {
  if (!rig) return;
  const { sheet, object, authored } = rig;
  for (const key of AUTHORABLE_KEYS) {
    const pointer = object.props[key as keyof typeof FRAME_PROPS];
    const keyframes = sheet.sequence.__experimental_getKeyframes(
      pointer as Parameters<typeof sheet.sequence.__experimental_getKeyframes>[0],
    );
    if (keyframes && keyframes.length > 0) authored.add(key);
    else authored.delete(key);
  }
}

/** L'éditeur est-il monté ? Renseigné par `TheatreStudio` en développement. */
let studioMounted = false;

/** Signale que le panneau d'édition est à l'écran (dev uniquement). */
export function setTheatreStudioMounted(mounted: boolean) {
  studioMounted = mounted;
}

/** Instance Theatre Studio, pour `snapshotFrame`. Renseignée par `TheatreStudio`. */
let studioApi: IStudio | null = null;

/** Signale l'instance Theatre Studio disponible (ou sa disparition au démontage). */
export function setTheatreStudioApi(studio: IStudio | null) {
  studioApi = studio;
}

/** Remet la tête de lecture de l'éditeur à 0 — à coupler à un redémarrage de la transition. */
export function resetTheatrePlayhead() {
  const current = getTransitionRig();
  if (!current) return;
  current.sheet.sequence.position = 0;
}

/**
 * Accorde la tête de lecture de l'éditeur et l'horloge de la transition.
 *
 * @param t          Instant de la transition tel que l'appli le connaît.
 * @param theatreOwns `true` en mode scrub : c'est la tête de lecture de
 *                    l'éditeur qui fait loi et qui est renvoyée.
 * @returns l'instant à échantillonner, en secondes.
 */
export function syncTheatrePlayhead(t: number, theatreOwns: boolean): number {
  const current = getTransitionRig();
  if (!current) return t;

  if (theatreOwns && studioMounted) {
    const position = current.sheet.sequence.position;
    return Number.isFinite(position) ? position : t;
  }

  current.sheet.sequence.position = t;
  return t;
}

/**
 * Surcharge `frame` avec les pistes écrites dans l'éditeur.
 *
 * À appeler en toute fin de `samplePlaying`, une fois que le code a rempli les
 * 16 champs : ce qui n'a pas été séquencé dans Theatre reste tel quel. La tête
 * de lecture a déjà été positionnée par `syncTheatrePlayhead`.
 */
export function applyTheatreFrame(frame: TransitionFrame) {
  const current = getTransitionRig();
  if (!current) return;

  if (process.env.NODE_ENV === "development") {
    const now = performance.now();
    if (now - lastMaskCheck > MASK_REFRESH_MS) {
      lastMaskCheck = now;
      refreshAuthoredMask();
    }
  }

  const { object, authored } = current;
  if (authored.size === 0) return;

  const v = object.value as TransitionFrame;

  if (authored.has("zoom")) frame.zoom = v.zoom;
  if (authored.has("framing")) frame.framing = v.framing;
  if (authored.has("scatter")) frame.scatter = v.scatter;
  if (authored.has("mosaicOpacity")) frame.mosaicOpacity = v.mosaicOpacity;
  if (authored.has("tileScale")) frame.tileScale = v.tileScale;
  if (authored.has("tileTiltX")) frame.tileTiltX = v.tileTiltX;
  if (authored.has("tileTiltY")) frame.tileTiltY = v.tileTiltY;
  if (authored.has("tileRoll")) frame.tileRoll = v.tileRoll;
  if (authored.has("reveal")) frame.reveal = v.reveal;
  if (authored.has("scroll")) frame.scroll = v.scroll;
  if (authored.has("slide")) frame.slide = v.slide;
  if (authored.has("columnOpacity")) frame.columnOpacity = v.columnOpacity;
  if (authored.has("bracketPad")) frame.bracketPad = v.bracketPad;
  if (authored.has("bracketAlpha")) frame.bracketAlpha = v.bracketAlpha;
  if (authored.has("overlayExit")) frame.overlayExit = v.overlayExit;
  if (authored.has("textRevealed")) frame.textRevealed = v.textRevealed;
}

/**
 * Grave les 16 valeurs courantes de `frame` dans l'objet Theatre, en une seule
 * transaction annulable.
 *
 * `set()` sur une piste déjà séquencée pose une keyframe à la position de
 * lecture actuelle ; sur une piste vierge, il ne fait que réviser sa valeur
 * statique par défaut (aucune keyframe créée, `authored` ne bouge pas), pour
 * que la première keyframe posée plus tard dans cette piste parte d'ici plutôt
 * que d'une valeur arbitraire.
 *
 * Renvoie `false` si le studio n'est pas encore monté (import dynamique en
 * cours) — l'appelant peut réessayer après un court délai.
 */
export function snapshotFrame(frame: TransitionFrame): boolean {
  const current = getTransitionRig();
  if (!current || !studioApi) return false;

  studioApi.transaction(({ set }) => {
    set(current.object.props, frame);
  });

  return true;
}
