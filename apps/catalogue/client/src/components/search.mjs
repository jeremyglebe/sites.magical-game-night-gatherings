export function searchPages(pages, query, section = "") {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return pages
    .filter((page) => !section || page.section === section)
    .flatMap((page) => {
      const title = page.title.toLocaleLowerCase();
      const text = (page.text || "").replace(/\s+/g, " ");
      const lower = text.toLocaleLowerCase();
      if (!terms.every((term) => title.includes(term) || lower.includes(term)))
        return [];
      const heading = page.headings?.find((h) =>
        terms.every((term) => h.text.toLocaleLowerCase().includes(term)),
      );
      const score =
        terms.reduce((n, term) => n + (title.includes(term) ? 10 : 0), 0) +
        (heading ? 4 : 0);
      const first = Math.max(0, lower.indexOf(terms[0]));
      const start = Math.max(0, first - 65);
      return [
        {
          ...page,
          score,
          snippet:
            (start ? "…" : "") +
            text.slice(start, start + 220) +
            (text.length > start + 220 ? "…" : ""),
          anchor: heading?.level > 1 ? heading.id : "",
        },
      ];
    })
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}
