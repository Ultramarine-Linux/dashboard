# Translations with Weblate

UI strings go through [i18nya](https://github.com/FyraLabs/i18nya). Catalogs are
nested JSON files in `dashboard/src/lib/i18n/langs`, one per BCP 47 locale
(`en.json`, `pt-BR.json`, ...), in the i18next v4 layout so Weblate can edit
them. `en.json` is the source of truth, and other locales fall back to it key
by key. Recipe text is translated in the recipe catalogs instead (see
[recipe catalogs](recipes.md)).

## Using strings

- In components, `import { t, tn, formatDateTime } from '#lib/i18n/index.js'`
  and use `t('ns.key', { name })`, where `ns.key` is the dotted path into
  `en.json` and `{{name}}` is a placeholder in the string. Each placeholder may
  appear only once per string.
- Plurals use i18next suffixes: `tn('apps.services', count)` reads
  `services_one` / `services_other` under `apps`, and `{{count}}` is the
  formatted number. Other languages add the CLDR forms they need (`_few`,
  `_many`, ...).
- On the server (hooks, `load`, actions, remote functions), use
  `serverT('ns.key')` from `#lib/server/i18n.js`.
- A key can't be both a string and a parent of other keys (use `x.label`).

New languages show up in **Account settings → Appearance → Language**. The
locale is picked from the `locale` cookie, then `Accept-Language`, then
English.

`pnpm i18n:check` validates the catalogs against `en.json` and reports
coverage. It runs in CI.

## Weblate

Translations are managed on [Fyra Labs Weblate](https://weblate.fyralabs.com).
Add English strings in code and `en.json`. Everything else comes from Weblate
pull requests. Non-English catalogs are excluded from Prettier, since Weblate
writes them.

Component settings:

| Setting                        | Value                                                    |
| ------------------------------ | -------------------------------------------------------- |
| File format                    | i18next JSON file v4                                     |
| File mask                      | `dashboard/src/lib/i18n/langs/*.json`                    |
| Monolingual base language file | `dashboard/src/lib/i18n/langs/en.json`                   |
| Edit base file                 | Off                                                      |
| Template for new translations  | Empty                                                    |
| Language code style            | BCP style using hyphen as a separator                    |
| File format parameters         | sort keys: case sensitive, indent: 1, indent style: tabs |
| Translation flags              | `i18next-interpolation`                                  |
| Version control system         | GitHub pull request, branch `main`                       |

Add-ons: **Cleanup translation files** and **Squash Git commits**. Add a GitHub
webhook to `https://weblate.fyralabs.com/hooks/github/` so Weblate picks up new
strings when `main` changes.
