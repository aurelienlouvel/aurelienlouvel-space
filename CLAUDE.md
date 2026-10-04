# oré — Portfolio

Monorepo contenant deux apps indépendantes :

| App | Dossier | URL |
|---|---|---|
| Site Next.js | `nextjs-app/` | Vercel |
| Sanity Studio | `sanity-studio/` | ore.sanity.studio |

## Lancer le projet

```bash
# Next.js
cd nextjs-app && pnpm dev        # localhost:3000

# Sanity Studio
cd sanity-studio && pnpm dev     # localhost:3333
```

## Stack

- **Next.js 16** App Router · TypeScript · Tailwind v4 · shadcn `luma`
- **Sanity v3** · projectId `87awwrcu` · dataset `production`
- **HugeIcons** (`@hugeicons/react`)
- Package manager : **pnpm**

## Branches & déploiement

| Branche | Domaine | Contenu |
|---|---|---|
| `prod` | ore.today (→ www.ore.today) | Landing : la page Notion du portfolio actuel + un bouton vers la preprod |
| `preprod` | preprod.ore.today | Le site WIP (Next.js + Sanity), publique mais non indexée |

**Flux** (pas de branche `dev` : les previews de branche en tiennent lieu) :

1. **Branche de feature** depuis `preprod` : chaque push a sa preview `ore-today-git-<branche>-ore.vercel.app`
   (publique, partageable tout de suite).
2. **PR vers `preprod`** : une fois mergée, c'est sur `preprod.ore.today`, l'environnement stable pour tester
   et montrer à d'autres personnes.
3. **Validé → `prod`** : `prod` reprend `preprod`.

- **Branche par défaut GitHub = `preprod`** : les PR et les nouvelles branches (sessions Claude comprises) partent de là.
- **`prod` = `preprod` + la landing Notion** (quelques commits, voir `nextjs-app/CLAUDE.md` sur `prod`).
  N'y toucher que pour la landing : tant que le nouveau site n'est pas lancé, l'étape 3 est en attente.
- **Lancement du nouveau site** : `prod` reprend `preprod` (la landing disparaît) →
  `git push origin preprod:prod --force-with-lease`. Pour garder l'historique : `git revert` des commits
  landing sur `prod`, puis `git merge preprod`. Ensuite, chaque validation est une promotion `preprod` → `prod`.
- **SEO** : la preprod envoie `X-Robots-Tag: noindex, nofollow` (règle sur le domaine dans `next.config.ts`,
  donc sans effet sur la prod). Pas de `robots.txt` `Disallow` : il empêcherait les robots de lire le noindex.
  Le SEO (titre, description, icônes) vit dans `nextjs-app/src/app/layout.tsx` et la prod le reprend tel quel.
- **Vercel** : *Production Branch* = `prod` ; le domaine `preprod.ore.today` est lié à la branche
  `preprod` (Settings → Domains). Pas d'alias dans `vercel.json` : il laisserait n'importe quelle branche
  revendiquer `preprod.ore.today`. Chaque branche garde son URL de preview `ore-today-git-<branche>-ore.vercel.app`.

## Commits

Format gitmoji : `<emoji>(<scope>): <description>`
Scopes : `nextjs` · `studio`

## Docs détaillées

- [`nextjs-app/CLAUDE.md`](nextjs-app/CLAUDE.md) — conventions Next.js, composants, patterns
- [`sanity-studio/CLAUDE.md`](sanity-studio/CLAUDE.md) — schéma, déploiement studio
