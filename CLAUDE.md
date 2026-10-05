# oré — Portfolio

Monorepo contenant deux apps indépendantes :

| App | Dossier | URL |
|---|---|---|
| Site Next.js | `nextjs-app/` | Vercel |
| Sanity Studio | `sanity-studio/` | aurelienlouvel.sanity.studio |

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
à l'autre par **merge** : `development` → `staging` → `production`. `main`, la branche par défaut, est la base
de toute feature.

| Branche | Rôle | Domaine | Contenu |
|---|---|---|---|
| `main` | Base des features (branche par défaut GitHub) | | Le site tel que promu en production, sans la landing |
| `development` | Intégration | `aurelienlouvel-space-git-development-ore.vercel.app` | Les features validées, avant le test d'ensemble |
| `staging` | Pré-production | staging.aurelienlouvel.space (publique, non indexée) | Le site WIP (Next.js + Sanity), stable pour tester et montrer à d'autres personnes |
| `production` | Live | www.aurelienlouvel.space (`aurelienlouvel.space`, `oré.space` et `ore.today` y redirigent) | Landing : la page Notion du portfolio actuel + un bouton vers le staging |

**Flux** :

1. **Branche de feature** créée depuis `main` : chaque push a sa preview
   `aurelienlouvel-space-git-<branche>-ore.vercel.app` (publique, partageable tout de suite).
2. **PR vers `development`** (pas vers `main`, que GitHub propose par défaut) quand la feature est prête.
3. **Promotion `development` → `staging`** quand l'ensemble est bon à tester et à montrer : merge, et c'est
   sur `staging.aurelienlouvel.space`.
4. **Promotion `staging` → `production`** une fois validé : merge, et c'est sur `www.aurelienlouvel.space`.
5. **`main` rattrape la release** : merge de `staging` dans `main` juste après l'étape 4.

- **Une promotion est un merge commit** (`git merge --no-ff`, ou « Create a merge commit » sur GitHub), jamais
  un squash ni un rebase : les branches divergeraient et chaque promotion suivante re-conflicterait. Le flux est
  à sens unique : pas de commit direct sur `main`, `staging` ni `production` (la landing passe par une branche
  `landing/<sujet>` et une PR, ci-dessous) ; un hotfix suit le même chemin, en accéléré.
- **Branche par défaut GitHub = `main`** : les nouvelles branches (sessions Claude comprises) partent de là, et
  c'est voulu. `main` ne reçoit que `staging` après une release (étape 5), jamais `production` ni `development`.
- **Landing** : tant que le nouveau site n'est pas lancé, `production` = `staging` + la page Notion (quelques
  commits propres à `production`, voir `nextjs-app/CLAUDE.md` sur `production`). Les autres routes y redirigent
  vers `/` : promouvoir `staging` n'y change rien de visible. Ces commits ne remontent jamais, ni vers `staging`
  ni vers `main` (sinon la base des features aurait la landing), et on ne touche à `production` que pour la
  landing, par une branche `landing/<sujet>` créée depuis `production` et une PR vers `production` (merge
  commit).
- **Lancement du nouveau site** : sur une branche `landing/lancement` créée depuis `production`,
  `git merge --no-commit staging`, puis `git checkout staging -- <fichiers de la landing>` (liste dans
  `nextjs-app/CLAUDE.md`) et `git commit` : la landing disparaît, l'historique reste ; PR vers `production`, en
  merge commit. Ensuite, chaque validation est une promotion `staging` → `production` ordinaire, et
  `production` a le même contenu que `staging` : l'étape 5 se fait alors depuis `production` (c'est le schéma
  de release classique), `branch-flow.yml` passe à `main` ← `production` (sans `landing/*`) et les règles
  propres à la landing sortent de ce fichier.
- **SEO** : le staging envoie `X-Robots-Tag: noindex, nofollow` (règle sur le domaine
  `staging.aurelienlouvel.space` dans `next.config.ts`, donc sans effet sur `production`). Pas de `robots.txt`
  `Disallow` : il empêcherait les robots de lire le noindex. Le SEO (titre, description, icônes) vit dans
  `nextjs-app/src/app/layout.tsx` et `production` le reprend tel quel.
- **Garde-fous GitHub** : le workflow `branch-flow` (`.github/workflows/branch-flow.yml`) ferme toute PR qui sort
  du flux : `development` ← une feature, `staging` ← `development`, `production` ← `staging` ou
  `landing/<sujet>`, `main` ← `staging`. Le ruleset `protect-flow-branches` (Settings → Rules) protège `main`,
  `staging` et `production` : ni push direct, ni force-push, ni suppression ; merge par PR uniquement, en
  « Create a merge commit », avec le check `branch-flow` obligatoire ; aucun contournement, pas même pour le
  propriétaire (en cas d'urgence, désactiver le ruleset dans Settings → Rules, puis le réactiver). Sur une PR de
  promotion, ne jamais cliquer « Update branch » (il fusionne la base dans la branche source : c'est ainsi que
  `main` s'est retrouvé dans `production` avec la PR #8). GitHub le refuse quand la source est protégée
  (`staging`), mais pas pour `development`, qu'aucun ruleset ne couvre : vigilance sur la PR `development` →
  `staging`. Ne pas suivre non plus le bandeau « Compare & pull request » de `production` ou `staging`.
- **Vercel** : *Production Branch* = `production` ; `staging.aurelienlouvel.space` est lié à la branche
  `staging` (Settings → Domains). Pas d'alias dans `vercel.json` : il laisserait n'importe quelle branche
  revendiquer un domaine. Chaque branche, `development` comprise, garde son URL de preview
  `aurelienlouvel-space-git-<branche>-ore.vercel.app`.
- **Domaines** : `www.aurelienlouvel.space` est le domaine principal, celui qui sert le site.
  `aurelienlouvel.space` (l'apex) et `oré.space` sont enregistrés chez Spaceship (renouvellement manuel à
  surveiller : le prix saute dès la 2ᵉ année), et leur DNS est chez Vercel (nameservers `ns1.vercel-dns.com` et
  `ns2.vercel-dns.com`). Les autres domaines redirigent (308, réglé dans Vercel → Settings → Domains, pas dans
  le code) : `aurelienlouvel.space`, `oré.space`, `www.oré.space`, `ore.today` et `www.ore.today` vers
  `www.aurelienlouvel.space`, `staging.oré.space` et `staging.ore.today` vers `staging.aurelienlouvel.space`.
  Dans Vercel, `oré.space` s'écrit en punycode, `xn--or-cja.space` (c'est ce que le navigateur envoie dans
  l'en-tête Host). `ore.today` reste chez Vercel jusqu'au 1ᵉʳ mars 2027, sans renouvellement automatique.

## Commits

Format gitmoji : `<emoji>(<scope>): <description>`
Scopes : `nextjs` · `studio`

## Docs détaillées

- [`nextjs-app/CLAUDE.md`](nextjs-app/CLAUDE.md) — conventions Next.js, composants, patterns
- [`sanity-studio/CLAUDE.md`](sanity-studio/CLAUDE.md) — schéma, déploiement studio
