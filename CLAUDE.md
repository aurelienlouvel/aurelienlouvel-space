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

**Environment branching** : une branche longue durée par environnement, et les changements passent de l'une
à l'autre par **merge** : `development` → `staging` → `production`.

| Branche | Environnement | Domaine | Contenu |
|---|---|---|---|
| `development` | Intégration (branche par défaut GitHub) | `ore-today-git-development-ore.vercel.app` | Le travail en cours : toutes les features atterrissent ici |
| `staging` | Pré-production | preprod.ore.today (publique, non indexée) | Le site WIP (Next.js + Sanity), stable pour tester et montrer à d'autres personnes |
| `production` | Live | ore.today (→ www.ore.today) | Landing : la page Notion du portfolio actuel + un bouton vers le staging |

**Flux** :

1. **Branche de feature** créée depuis `development` : chaque push a sa preview
   `ore-today-git-<branche>-ore.vercel.app` (publique, partageable tout de suite).
2. **PR vers `development`** quand la feature est prête.
3. **Promotion `development` → `staging`** quand l'ensemble est bon à tester et à montrer : merge, et c'est
   sur `preprod.ore.today`.
4. **Promotion `staging` → `production`** une fois validé : merge, et c'est sur `ore.today`.

- **Une promotion est un merge commit** (`git merge --no-ff`, ou « Create a merge commit » sur GitHub), jamais
  un squash ni un rebase : les branches divergeraient et chaque promotion suivante re-conflicterait. Le flux est
  à sens unique : pas de commit direct sur `staging` ni `production` (sauf la landing, ci-dessous) ; un hotfix
  suit le même chemin, en accéléré.
- **Branche par défaut GitHub = `development`** : les PR et les nouvelles branches (sessions Claude comprises)
  partent de là.
- **Landing** : tant que le nouveau site n'est pas lancé, `production` = `staging` + la page Notion (quelques
  commits propres à `production`, voir `nextjs-app/CLAUDE.md` sur `production`). Les autres routes y redirigent
  vers `/` : promouvoir `staging` n'y change rien de visible. Ces commits ne remontent jamais, et on ne touche à
  `production` que pour la landing.
- **Lancement du nouveau site** : sur `production`, `git merge --no-commit staging`, puis
  `git checkout staging -- <fichiers de la landing>` (liste dans `nextjs-app/CLAUDE.md`) et `git commit` : la
  landing disparaît, l'historique reste. Ensuite, chaque validation est une promotion `staging` → `production`
  ordinaire.
- **SEO** : le staging envoie `X-Robots-Tag: noindex, nofollow` (règle sur le domaine `preprod.ore.today` dans
  `next.config.ts`, donc sans effet sur `production`). Pas de `robots.txt` `Disallow` : il empêcherait les
  robots de lire le noindex. Le SEO (titre, description, icônes) vit dans `nextjs-app/src/app/layout.tsx` et
  `production` le reprend tel quel.
- **Vercel** : *Production Branch* = `production` ; le domaine `preprod.ore.today` (nom historique, c'est le
  staging) est lié à la branche `staging` (Settings → Domains). Pas d'alias dans `vercel.json` : il laisserait
  n'importe quelle branche revendiquer `preprod.ore.today`. Chaque branche, `development` comprise, garde son
  URL de preview `ore-today-git-<branche>-ore.vercel.app`.

## Commits

Format gitmoji : `<emoji>(<scope>): <description>`
Scopes : `nextjs` · `studio`

## Docs détaillées

- [`nextjs-app/CLAUDE.md`](nextjs-app/CLAUDE.md) — conventions Next.js, composants, patterns
- [`sanity-studio/CLAUDE.md`](sanity-studio/CLAUDE.md) — schéma, déploiement studio
