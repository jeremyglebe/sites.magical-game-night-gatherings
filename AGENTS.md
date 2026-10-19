# Working on the catalogue

The owner's goal is a usable rules reference, not a collection of summaries.

- Each format family has a parent page linking to its separate rulesets.
- Keep conflicting versions on separate pages. Do not combine them into a new default without an explicit design decision.
- Rules pages must contain the actual procedures: materials, deck construction, setup, turns, restrictions, victory conditions, exceptions, and optional rules. A short overview or an external link does not replace the rules.
- Preserve existing rule detail when reorganizing. Clearly identify unresolved rules instead of inventing a ruling or silently dropping the issue.
- Boxed sets identify a specific base ruleset and spell out every addition, replacement, and optional module. Keep unfinished sets visibly marked as drafts.
- Cite original sources. Keep reference notes separate from playable rules. Do not represent a source's suggestion or a commenter's house rule as a universal rule.
- Use the Scryfall MCP server for official card names, Oracle text, and card rulings. It does not define fan-format rules or contain custom Treachery identities.
- Edit the Markdown source, not generated HTML in `docs/`. Check `npm run build` and `npm run build:github` before refreshing tracked GitHub Pages output with `npm run publish:github`.
- Do not replace full rules with summaries to shorten pages. Use headings and navigation to make long rules readable.
