# Recipe catalogs

**Apps** cooks applications from recipes and deploys them as Quadlets, so the
server needs Tetra, Podman and systemd's Quadlet support. The app pages live in
`dashboard/src/routes/(app)/(server)/apps`, and the catalog code in
`dashboard/src/lib/apps` and `dashboard/src/lib/server/recipes`.

Recipes come from
[Ultramarine-Linux/recipes](https://github.com/Ultramarine-Linux/recipes) and
never live in this repository. Dashboard fetches the published catalog at
runtime and caches it under `$UM_DASHBOARD_STATE_DIR/recipes/<catalog>/`.
Recipe names, descriptions, parameter labels and categories are translated in
the recipes repo, not in `langs/`.

## Format

A catalog is `<base>/index.json` plus one content-addressed bundle per recipe.
Each index entry's `bundle` is a plain relative path under the catalog, and
paths that could leave it (`..`, absolute paths, other origins) are rejected.
Every bundle is checked against its index entry: same id and version, and a
recomputed digest (Tetra's `bundle_sha256`) that matches both the index's and
the bundle's own. Tetra recomputes the digest again when it installs.

## Refreshing

- `RECIPES_URL` is the Fyra Labs catalog's base URL, the one `index.json` is
  under (default `https://recipes.fyralabs.com/v1`).
- `RECIPES_REFRESH_INTERVAL` is how often, in minutes, every catalog is
  refreshed in the background (default 360, `0` only refreshes on startup).

Refreshes are conditional (ETag / Last-Modified), download only bundles that
aren't cached, and verify every bundle before the new index replaces the old
one. A failed refresh keeps the previous catalog and shows administrators why.
Requests never wait on the network, except an administrator's explicit refresh
or add.

## The seed

The production image mirrors the Fyra Labs catalog (`index.json` and the
bundles it lists) into `/app/recipes-seed/fyra` at build time. The build args
are `RECIPES_URL` and `RECIPES_SEED`: `required` fails the build when the
catalog can't be fetched, `optional` (the default, for offline local builds)
builds without it, and `off` skips it. The Image workflow builds every
published image with `required`, so a release can't ship without the catalog.

On first start, with no catalog cached yet, Dashboard imports the seed
(`UM_DASHBOARD_RECIPES_SEED_DIR`) through the same digest checks as a
download, then refreshes from `RECIPES_URL`. Without a seed or network the
catalog is empty until a refresh succeeds. To seed by hand, mirror
`<url>/index.json` and each `recipes[].bundle` path into `<seed dir>/fyra/`.

## Added catalogs

Administrators can add more catalogs in the same format under
**Administration → Recipe catalogs**, and refresh or remove them there. A
catalog URL must be https (http works for `localhost`), and redirects must
stay on the same origin. Its index is fetched and checked before the catalog
is saved, so a typo never gets saved.

Recipes from an added catalog are always installed as `custom`, whatever the
catalog claims. Only the Fyra Labs catalog's recipes are `official` or
`community`.
