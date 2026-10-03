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
| `preprod` | preprod.ore.today | Le site WIP (Next.js + Sanity) |

- **On développe à partir de `preprod`** : branche de feature → PR vers `preprod`.
- **`prod` = `preprod` + un seul commit** : la landing Notion (voir `nextjs-app/CLAUDE.md` sur `prod`).
  N'y toucher que pour la landing.
- **Mise en prod du nouveau site** : `prod` reprend `preprod` (le commit landing disparaît) →
  `git push origin preprod:prod --force-with-lease`. Pour garder l'historique : `git revert` du commit
  landing sur `prod`, puis `git merge preprod`.
- **Vercel** : *Production Branch* = `prod` ; le domaine `preprod.ore.today` est lié à la branche
  `preprod` (Settings → Domains). Pas d'alias dans `vercel.json` : il laisserait n'importe quelle branche
  revendiquer `preprod.ore.today`. Chaque branche garde son URL de preview `ore-today-git-<branche>-ore.vercel.app`.

## Commits

Format gitmoji : `<emoji>(<scope>): <description>`
Scopes : `nextjs` · `studio`

## Docs détaillées

- [`nextjs-app/CLAUDE.md`](nextjs-app/CLAUDE.md) — conventions Next.js, composants, patterns
- [`sanity-studio/CLAUDE.md`](sanity-studio/CLAUDE.md) — schéma, déploiement studio
