# Game Night

This is a fan-made working catalogue for Magic: The Gathering game-night formats and boxed-set ideas. It collects official-style, fan-made, and personal variants that are useful for casual prebuilt nights.

The boxed sets described here are personal play kits and catalogue entries, not products.

## Two sections, one repository

| Section | Source | Development |
| --- | --- | --- |
| **Tabletop App** | [`apps/tabletop/`](apps/tabletop/README.md) — local Vue + daisyUI client, Node server, MCP tools, players and saved games | `npm run playtest` builds and starts the app. For UI development, use `npm run tabletop:dev` alongside the server. |
| **Catalogue Site** | [`apps/catalogue/`](apps/catalogue/README.md) — Vue + daisyUI site, with rules kept in root Markdown folders | `npm run catalogue:dev` (or `npm run dev`) |

The Tabletop App launches independent Codex CLI players, coordinates explicit handoffs, and saves game recordings. Its optional browser table shows up to six players; `npm run playtest:headless` runs without a viewer. `npm run playtest:review` opens the saved-game library. New tests use the Zombies vs Plants Jumpstart boxed set, with each player choosing two faction packs. Private game data stays in the ignored root `.playtest/` directory. See the [Tabletop App architecture and commands](apps/tabletop/README.md).

The Catalogue Site keeps its existing source paths and published URLs. Its build does not include the local Tabletop App or private game data.

The site is authored in Markdown. Format parent pages link to separate, complete rulesets; boxed-set pages identify their base rules and spell out every change. Preserve rules detail when editing. See [AGENTS.md](AGENTS.md) for the editing conventions.

## Running The Site

This site uses Vue and daisyUI, built with Vite. Its content compiler renders the existing Markdown into complete HTML pages, preserves heading anchors, expands shared rules, and builds local full-text search. Use the development command below rather than opening source files directly. Node 22.12 or newer is required.

Install dependencies once:

```bash
npm install
```

Run the local development server:

```bash
npm run dev
```

Then open the local URL printed by the command, usually:

```text
http://127.0.0.1:5173/
```

## Publishing The Site

Build the static site:

```bash
npm run build
```

The publishable website will be generated in:

```text
apps/catalogue/dist/
```

Upload the contents of `apps/catalogue/dist/` to a static host such as GitHub Pages, Netlify, Cloudflare Pages, or any ordinary web host. Do not upload the source Markdown files as the finished site unless the host is configured to run `npm run build` for you.

If you want a git-visible copy of the built site for local/root hosting, run:

```bash
npm run publish
```

That builds the site and copies the output into:

```text
docs/
```

The `docs/` folder is safe to track in git and can be used directly by GitHub Pages.

For local static testing, the server's document root must be `apps/catalogue/dist/`.

For example:

```bash
python -m http.server 5174 --directory apps/catalogue/dist
```

Or use the shortcut:

```bash
npm run serve:static
```

Then open:

```text
http://127.0.0.1:5174/
```

If you use a Live Server extension from the repo root and open `apps/catalogue/dist/index.html` as a nested path, the site may look unstyled because the generated HTML expects `/assets/...` to be served from the web root. Either open `apps/catalogue/dist/` as the served folder, or use `npm run preview`.

To test the tracked `docs/` copy:

```bash
npm run serve:docs
```

Then open:

```text
http://127.0.0.1:5175/
```

Use this local static test after `npm run publish`. If you build for GitHub project Pages with `npm run publish:github`, the generated site expects to live under `/sites.magical-game-night-gatherings/`, which matches GitHub Pages but not a plain local server rooted at `docs/`.

## GitHub Pages

GitHub Pages can publish from the `/docs` folder on your `main` branch.

In GitHub:

1. Go to the repository's **Settings**.
2. Open **Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
4. Set the branch to `main`.
5. Set the folder to `/docs`.
6. Save.

For a normal project Pages URL like:

```text
https://YOUR-USER.github.io/sites.magical-game-night-gatherings/
```

build the docs folder with:

```bash
npm run publish:github
```

That sets the catalogue base path to `/sites.magical-game-night-gatherings/`, copies the build into `docs/`, and makes GitHub Pages asset paths resolve correctly. This path follows the GitHub repository name, not the npm package name. The current published site is [jeremyglebe.com/sites.magical-game-night-gatherings/](https://jeremyglebe.com/sites.magical-game-night-gatherings/).

Commit and push the updated `docs/` folder after running that command.

If the site later moves to the domain root (`/`), use `npm run publish` instead. The current custom-domain project URL still needs the `/sites.magical-game-night-gatherings/` prefix.

## Sections

- [Formats](formats/): Rulesets and play modes, including fan-maintained formats and personal variants.
- [Boxed Sets](boxed-sets/): Curated game-night boxes built around those formats.
- [Using the Rules](rules/): Shared conventions and how boxed-set overrides work.
- [Research](research/): Saved card-pool catalogues, Marvel set codes, thematic candidates, and repeatable searches.
- [Sources](sources/): The original references and archived research notes.

## Organization

Each format folder should separate playable notes from archived reference material:

- `index.md`: The format parent page, linking to each separate ruleset. Section READMEs link to this maintained page.
- `sources/`: Copy-pasted or archived external material. Keep original links here.
- `variants/`: Complete rules for distinct versions, including local house variants. Keep established URLs when a rules page already lives elsewhere.
- `assets/`: Images, printable cards, and other supporting files.

When a format comes from another fan site or community post, preserve the original URL in both the source archive and the relevant overview page.


## Scryfall MCP

This project uses [cryppadotta/scryfall-mcp](https://github.com/cryppadotta/scryfall-mcp), installed as the exact development dependency **scryfall-mcp-server 0.1.1**. It provides card search, exact-name and ID lookup, card rulings, random cards, and prices. No API key is required.

Run `npm ci` to install the pinned dependency. The project-scoped configuration is in `.codex/config.toml`. Open this repository as a trusted project in a compatible Codex client, then restart or reload its MCP connections. The server runs over stdio using the locally installed executable; it does not need a public HTTP endpoint.

The configuration forwards existing proxy and CA environment settings and enables Node's environment-proxy support. **Use Node 24.5 or later when running through an HTTP proxy**, as in this cloud workspace. TLS verification stays enabled. There are no credentials in the project configuration.

A running chat may not hot-load a newly added MCP server. Until it reloads, a local MCP client can invoke the same server. The installation was verified with actual card, search, and ruling requests. Client registration and a successful card lookup are separate checks.

Use Scryfall to verify official card names, Oracle text, and card rulings. Fan-format rules come from their cited format sources. Custom Treachery identities remain in the local oracle/archive and the Treachery authors' own database.

## Editing rules without losing detail

- `formats/<family>/index.md` is the parent directory linking to every recorded version.
- Each version has its own rules page, normally under `variants/`. Existing Pile o' Magic and Hitmen URLs are retained.
- Rules pages contain materials, deck construction, setup, play procedure, victory conditions, and explicit exceptions. Do not replace these with a synopsis or a link to an external source.
- `boxed-sets/<name>.md` names the exact base version and writes out additional, replacement, and optional rules. Unchosen mechanics stay visibly marked as draft decisions.
- `sources/` is the reference index. Existing source notes remain available at their original URLs and link to the corresponding rules page.
- Shared Markdown includes live in `apps/catalogue/content/partials/`. The content compiler expands them into the full rendered page; readers do not have to open a partial to get the rules.
- Section READMEs link to the maintained Markdown pages instead of duplicating their contents.

The Treachery oracle JSON and research CSV/JSON downloads are copied into the built site by the catalogue build. Local downloads are collected from Markdown links and checked before rendering.

## Maintaining the research catalogue

The [research index](research/index.md) links the saved Marvel set reference and everyday-life card catalogue. Research notes are distinct from playable format rules and finished box lists.

The everyday-life card entries are maintained in `research/everyday-life/cards.json`. Each entry has a verified printing, exact type line, editorial fit label, explanation, and date. Edit those records, then run `npm run research:render` to refresh the category tables, counts, and spreadsheet CSV together. The renderer preserves prose outside the marked catalogue blocks. Keep the search log and research date current when adding a new research pass.

Token profiles are maintained separately in `research/everyday-life/tokens.md`. They must not be silently mixed into the ordinary deck-card list. Preserve the explanations on almost matches and the distinction between thematic judgments and actual card/format rules.
