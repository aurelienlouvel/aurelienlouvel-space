/**
 * Fallback de la coquille projet (`layout.tsx`).
 *
 * Sa seule raison d'être est de créer la frontière <Suspense> qui permet au
 * routeur de valider la navigation SANS attendre le fetch Sanity : le drawer
 * démarre au clic, ce squelette occupe la feuille, puis `page.tsx` s'y
 * substitue en streaming.
 *
 * Il calque la métrique réelle de `page.tsx` (mêmes paddings responsive, même
 * ratio de média, mêmes hauteurs de ligne de titre) pour que l'arrivée du
 * contenu ne déplace rien.
 */
const bar = "rounded-md bg-stone-100";

export default function ProjectLoading() {
  return (
    <div aria-hidden className="animate-pulse">
      <div className="px-4 sm:px-16 py-8 sm:py-12">
        {/* h1 — text-4xl sm:text-6xl, deux lignes */}
        <div className="mb-8 max-w-[820px] px-1 sm:px-0 space-y-2">
          <div className={`${bar} h-10 sm:h-15 w-full`} />
          <div className={`${bar} h-10 sm:h-15 w-3/5`} />
        </div>

        {/* Organisation + tags */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-2">
          <div className={`${bar} h-6 w-40`} />
          <div className="flex gap-2">
            <div className={`${bar} h-6 w-24`} />
            <div className={`${bar} h-6 w-20`} />
          </div>
        </div>
      </div>

      {/* Média — même boîte que <ProjectMediaBlock> */}
      <div className="px-4 sm:px-0">
        <div className="aspect-video w-full rounded-4xl bg-stone-100" />
      </div>

      {/* Role · mates · timeline · duration */}
      <div className="px-6 sm:px-16 py-8 sm:py-12 flex flex-wrap gap-8 sm:gap-12">
        {[160, 112, 144, 96].map((w, i) => (
          <div key={i} className="shrink-0">
            <div className={`${bar} mb-3 h-3 w-16`} />
            <div className={`${bar} h-7`} style={{ width: `${w}px` }} />
          </div>
        ))}
      </div>

      <div className="h-px w-full bg-border" />

      {/* Contenu */}
      <div className="mt-4 px-4 sm:px-16 py-8 sm:py-12 space-y-3">
        <div className={`${bar} h-4 w-full`} />
        <div className={`${bar} h-4 w-11/12`} />
        <div className={`${bar} h-4 w-4/5`} />
      </div>
    </div>
  );
}
