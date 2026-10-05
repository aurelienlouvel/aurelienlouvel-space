# oré — Sanity Studio

Studio déployé sur **aurelienlouvel.sanity.studio** · projectId `87awwrcu` · dataset `production`

## Lancer / déployer

```bash
pnpm dev                                                    # localhost:3333
node_modules/.bin/sanity build && node_modules/.bin/sanity deploy --no-build --url aurelienlouvel -y   # → aurelienlouvel.sanity.studio
```

> ⚠️ Ne pas utiliser `pnpm sanity deploy` — pnpm v11 bloque le build script d'esbuild (ERR_PNPM_IGNORED_BUILDS). Appeler le binaire directement bypasse ce check.

## Schéma

| Type | Champs principaux |
|---|---|
| `project` | title, slug, thumbnail (file image/vidéo), description, organisation, startDate, endDate, tags[], roles[], contributors[], redirectUrl, sections[] |
| `organisation` | name, logo (image), description, websiteUrl |
| `tag` / `role` | name, icon (nom HugeIcon), color (valeur Tailwind ex: `red-300`) |
| `person` | firstName, lastName, avatar (image), linkedinUrl |

## Conventions

- Les thumbnails sont de type `file` (pas `image`) — CDN : `cdn.sanity.io/files/87awwrcu/production/`
- Couleurs tags/roles : stocker le nom de couleur Tailwind (`red`, `yellow`, etc.)
- Icons : stocker le nom de l'export HugeIcon (ex: `"Folder02Icon"`)
- Avant de modifier le schéma, vérifier la compatibilité avec les données existantes

## Composants custom

| Composant | Usage |
|---|---|
| `ColorInput` | Picker de couleur Tailwind (cercles colorés) |
| `IconInput` | Picker d'icône HugeIcon avec recherche |
| `navIcons.tsx` | Icônes de navigation dans la sidebar |
