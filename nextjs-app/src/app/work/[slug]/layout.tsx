import { ViewTransition } from "react";
import { PageShell } from "@/components/layout/PageShell";

/**
 * Coquille de la page projet — rendue AVANT que le contenu Sanity soit prêt.
 *
 * La <ViewTransition> et le <PageShell> vivent ICI (et non dans `page.tsx`)
 * pour que le drawer parte dès le clic : ce layout n'a aucune donnée à
 * attendre, donc Next.js le monte immédiatement avec le fallback de
 * `loading.tsx`, pendant que `page.tsx` (async, `client.fetch`) streame
 * derrière. Le contenu remplace ensuite le squelette À L'INTÉRIEUR de la
 * coquille déjà à l'écran — la transition de page ne rejoue pas.
 *
 * Bonus : `PageShell` (et donc LocomotiveScroll) n'est plus démonté/remonté
 * quand le contenu arrive.
 */
export default function ProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ViewTransition
      enter={{ "nav-forward": "view-transition-enter-fwd", default: "none" }}
      exit={{ "nav-back": "view-transition-exit-back", default: "none" }}
      default="none"
    >
      <PageShell restore="top">
        <main className="w-full bg-white rounded-t-2xl">
          <div className="mx-auto max-w-5xl pt-4 sm:pt-16 pb-12 sm:pb-64">
            {children}
          </div>
        </main>
      </PageShell>
    </ViewTransition>
  );
}
