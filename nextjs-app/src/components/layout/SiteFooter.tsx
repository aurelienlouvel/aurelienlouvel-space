/**
 * Mention de copyright — dernier élément des pages qui défilent (work, projet, info).
 *
 * À poser APRÈS le <main> (et non dedans) : un <footer> n'est un repère
 * `contentinfo` que s'il n'est pas descendant de <main>.
 *
 * Il porte aussi la marge basse de la page : l'ActionBar flottante (`fixed
 * bottom-12`, `h-16`) recouvre de 3 à 7 rem au-dessus du bas de l'écran, donc
 * `pb-36` (9 rem) garde les deux lignes visibles au-dessus d'elle en fin de
 * scroll. Absent de /play, qui n'a pas de page à faire défiler.
 */
export function SiteFooter() {
  return (
    <footer className="px-6 pt-16 pb-36 text-center text-sm font-medium text-stone-400">
      <p>© 2026. Aurélien Louvel</p>
      <p>All Rights Reserved</p>
    </footer>
  );
}
