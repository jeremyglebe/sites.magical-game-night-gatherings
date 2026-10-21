# Catalogue Site

Vue and daisyUI provide the catalogue interface. Vite builds the client; a small Markdown compiler and Vue server renderer produce a complete HTML document for every public page. There is no VitePress dependency and no production Node server requirement.

## Commands

From the repository root, with Node 22.12 or newer:

- `npm run dev` — development server at http://127.0.0.1:5173, with Markdown reload and Vue hot updates.
- `npm run build` — root-hosted static output in `apps/catalogue/dist/`.
- `npm run build:github` — static output with the repository's GitHub Pages prefix.
- `npm run preview` — preview the last build at http://127.0.0.1:5174 using its saved base path (including the GitHub Pages prefix when applicable).
- `npm run catalogue:test` — content, navigation, search and build-contract checks.
- `npm run publish:github` — build and refresh tracked `docs/` output. Commit and push separately when ready to publish.

## Where to edit

| Concern | Location |
| --- | --- |
| Rules and reference prose | Root `formats/`, `boxed-sets/`, `rules/`, `research/`, `sources/` Markdown |
| Home copy | Root `index.md` frontmatter and Markdown |
| Home format index | `client/src/pages/HomePage.vue` |
| Full article layout and contents | `client/src/pages/ArticlePage.vue`, `components/ArticleOutline.vue` |
| Markdown typography | `client/src/components/CatalogueProse.vue` |
| Header, theme switch, mobile navigation | `client/src/App.vue` |
| Grouped navigation | `client/src/navigation.js` |
| Local search and ranking | `client/src/components/CatalogueSearch.vue`, `search.mjs` |
| Colors and font tokens | `client/src/theme.css` |
| Markdown includes, URL/anchor validation | `content/catalogue.mjs` |
| Shared rule sections | `content/partials/` |
| Static rendering, asset copying | `scripts/build.mjs`, `scripts/render.mjs` |

Keep playable rule detail and conflicting versions intact; see root `AGENTS.md`. The compiler intentionally includes only the public content roots. App files, local game recordings, credentials, and README files are excluded.

## Static routing and search

Existing directory URLs keep `index.html`; individual rules pages keep `.html` URLs. Every page contains its full rendered content before JavaScript loads, so links, headings, tables, warnings and navigation work on static hosts. Vue hydrates search, theme controls, and mobile navigation. Search downloads a local `search-index.json` only when opened; it never calls an external search service.

The build preserves VitePress-compatible heading IDs so existing deep links keep working. Included Markdown is expanded before rendering and search indexing. Local download targets are copied with their relative directory structure. Missing local links, unknown heading targets, circular includes and non-content paths fail the build.

Set `CATALOGUE_BASE` to an absolute path ending in `/` for another deployment prefix. The browser receives the same base used to render content links and asset URLs. The custom 404 document offers navigation and search; valid page URLs do not depend on a fallback rewrite.

## Relationship to the Tabletop App

The Catalogue Site is public, static and read-only. The local Tabletop App reads selected Markdown rules as references, including shared partials. It retains its own client, server, dependencies and ignored `.playtest/` recordings. Changing the catalogue UI does not start players or alter saved games.
