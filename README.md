# Ultramarine Dashboard

The web dashboard for Ultramarine Server. It runs on the server it manages and
talks to it through the local [Tetra](docs/tetra.md) agent.

```sh
pnpm install
TETRA_MOCK=1 pnpm dev   # in-memory Tetra, sign in as admin/admin
```

- **Services**: the landing page every user gets, with the entries an
  administrator published on the server.
- **Apps**: cook, update and remove recipe-backed applications, deployed as
  Quadlets from the [recipe catalogs](docs/recipes.md).
- **Server pages**: overview, Podman containers, Quadlets, network, reverse
  proxy, storage and users, read live from Tetra and shown according to each
  account's [permissions](docs/tetra.md#accounts-and-permissions).
- **Single sign-on**: an OIDC provider, so apps on the server can sign in with
  the server's accounts.
- **Administration**: feature flags, recipe catalogs and single sign-on
  clients.

## Documentation

- [Development](docs/development.md)
- [Tetra, accounts and permissions](docs/tetra.md)
- [Recipe catalogs](docs/recipes.md)
- [Configuration](docs/configuration.md)
- [Container image and releases](docs/container-image.md)
- [Database migrations](docs/migrations.md)
- [Translations with Weblate](docs/translations.md)
