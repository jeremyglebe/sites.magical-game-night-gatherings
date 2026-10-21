import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { dirname, relative, resolve, sep, posix } from 'node:path';
import MarkdownIt from 'markdown-it';
import matter from 'gray-matter';
import container from 'markdown-it-container';
import anchor from 'markdown-it-anchor';
import { slugify } from '@mdit-vue/shared';

export const contentDirectories = ['formats', 'boxed-sets', 'rules', 'research', 'sources'];
const sections = { formats: 'Formats', 'boxed-sets': 'Boxed Sets', rules: 'Using the Rules', research: 'Research', sources: 'Sources' };
const assetExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.pdf', '.json', '.csv', '.txt', '.zip']);
const normalizePath = path => path.split(sep).join('/');

export function normalizeBase(base = '/') {
  if (!base.startsWith('/') || base.includes('..') || /[?#\\]/.test(base)) throw new Error('Catalogue base must be an absolute URL path');
  return base.replace(/\/+$/, '') + '/';
}

export function sourcePagePath(source) {
  const file = normalizePath(source);
  if (file === 'index.md') return '/';
  if (file.endsWith('/index.md')) return `/${file.slice(0, -8)}`;
  return `/${file.replace(/\.md$/, '.html')}`;
}

export function pageOutputPath(path) {
  if (!path.startsWith('/') || path.includes('..') || /[?#\\]/.test(path)) throw new Error('Invalid catalogue page path');
  return path.endsWith('/') ? `${path.slice(1)}index.html` : path.slice(1);
}

async function walk(directory, root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path, root));
    else if (entry.isFile()) files.push(normalizePath(relative(root, path)));
  }
  return files;
}

export async function catalogueSources(root) {
  const files = ['index.md'];
  for (const directory of contentDirectories) files.push(...await walk(resolve(root, directory), root));
  return files.filter(path => path.endsWith('.md') && !/\/(README|AGENTS)\.md$/.test(path));
}

async function expandIncludes(root, source, ancestors = []) {
  const actual = await realpath(resolve(root, source));
  const local = normalizePath(relative(root, actual));
  if (!/^(?:index\.md|(?:formats|boxed-sets|rules|research|sources|apps\/catalogue\/content\/partials)\/.*\.md)$/.test(local)) {
    throw new Error(`Include is outside catalogue content: ${source}`);
  }
  if (ancestors.includes(actual)) throw new Error(`Circular catalogue include: ${source}`);
  const contents = await readFile(actual, 'utf8');
  const pattern = /^\s*<!--\s*@include:\s*(.*?)\s*-->\s*$/gm;
  let result = '', position = 0;
  for (const match of contents.matchAll(pattern)) {
    result += contents.slice(position, match.index);
    const include = normalizePath(relative(root, resolve(dirname(actual), match[1])));
    result += await expandIncludes(root, include, [...ancestors, actual]);
    position = match.index + match[0].length;
  }
  return result + contents.slice(position);
}

function inlineText(token) {
  return (token.children || []).map(child => {
    if (child.type === 'softbreak' || child.type === 'hardbreak') return ' ';
    if (['text', 'code_inline', 'image'].includes(child.type)) return child.content;
    return '';
  }).join('');
}

function renderer({ source, sourceSet, base, assets, localLinks }) {
  const md = new MarkdownIt({ html: true, linkify: true, typographer: false });
  for (const kind of ['info', 'warning', 'tip', 'danger', 'details']) {
    md.use(container, kind, {
      render(tokens, index) {
        if (tokens[index].nesting === -1) return '</aside>\n';
        const title = tokens[index].info.trim().slice(kind.length).trim() || kind[0].toUpperCase() + kind.slice(1);
        return `<aside class="custom-block ${kind}"><p class="custom-block-title">${md.utils.escapeHtml(title)}</p>\n`;
      },
    });
  }
  md.use(anchor, { slugify, level: 1, tabIndex: '-1' });
  const rewrite = raw => {
    if (!raw || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(raw)) return raw;
    if (raw.startsWith('#')) {
      if (raw.length > 1) localLinks.push({ source, target: source, hash: raw });
      return raw;
    }
    const url = new URL(raw, `https://catalogue.invalid/${source}`);
    let target;
    try { target = decodeURIComponent(url.pathname).slice(1); }
    catch { throw new Error(`Invalid link encoding in ${source}: ${raw}`); }
    if (target.endsWith('/')) target += 'index.md';
    else if (target.endsWith('.html')) target = target.slice(0, -5) + '.md';
    else if (!posix.extname(target)) {
      if (sourceSet.has(`${target}.md`)) target += '.md';
      else if (sourceSet.has(`${target}/index.md`)) target += '/index.md';
    }
    let path;
    if (sourceSet.has(target)) path = sourcePagePath(target);
    else if (assetExtensions.has(posix.extname(target).toLowerCase()) && contentDirectories.includes(target.split('/')[0])) {
      assets.add(target);
      path = `/${target}`;
    } else throw new Error(`Unknown local catalogue link in ${source}: ${raw}`);
    localLinks.push({ source, target, hash: url.hash });
    // Encode asset names (including spaces/Unicode) while preserving separators.
    return base + path.slice(1).split('/').map(encodeURIComponent).join('/') + url.search + url.hash;
  };
  const originalLink = md.renderer.rules.link_open || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.link_open = (tokens, index, options, env, self) => {
    tokens[index].attrSet('href', rewrite(tokens[index].attrGet('href')));
    return originalLink(tokens, index, options, env, self);
  };
  const originalImage = md.renderer.rules.image;
  md.renderer.rules.image = (tokens, index, options, env, self) => {
    tokens[index].attrSet('src', rewrite(tokens[index].attrGet('src')));
    tokens[index].attrSet('loading', 'lazy');
    return originalImage(tokens, index, options, env, self);
  };
  md.renderer.rules.table_open = () => '<div class="table-scroll" tabindex="0" role="region" aria-label="Scrollable table"><table>\n';
  md.renderer.rules.table_close = () => '</table></div>\n';
  return md;
}

/** Compile only public catalogue sources; private playtests and app files never enter the manifest. */
export async function compileCatalogue({ root, base = '/' }) {
  root = await realpath(root);
  base = normalizeBase(base);
  const sources = await catalogueSources(root);
  const sourceSet = new Set(sources), assets = new Set(), localLinks = [];
  const pages = [];
  for (const source of sources) {
    const expanded = await expandIncludes(root, source);
    const { content, data: frontmatter } = matter(expanded);
    const md = renderer({ source, sourceSet, base, assets, localLinks });
    const env = {}, tokens = md.parse(content, env);
    const headings = tokens.flatMap((token, index) => token.type === 'heading_open'
      ? [{ id: token.attrGet('id'), text: inlineText(tokens[index + 1]), level: Number(token.tag.slice(1)) }] : []);
    const text = tokens.filter(token => token.type === 'inline' || token.type === 'fence' || token.type === 'code_block')
      .map(token => token.type === 'inline' ? inlineText(token) : token.content).join('\n').trim();
    const title = frontmatter.title || headings.find(heading => heading.level === 1)?.text || frontmatter.hero?.name || 'MTG Game Night';
    const firstParagraphIndex = tokens.findIndex(token => token.type === 'paragraph_open');
    const firstParagraph = firstParagraphIndex >= 0 ? inlineText(tokens[firstParagraphIndex + 1]) : '';
    pages.push({
      path: sourcePagePath(source), source, title,
      description: frontmatter.description || frontmatter.hero?.tagline || firstParagraph.slice(0, 240),
      section: sections[source.split('/')[0]] || 'Home',
      html: md.renderer.render(tokens, md.options, env), headings, text, frontmatter,
    });
  }
  for (const asset of assets) {
    const fullPath = await realpath(resolve(root, asset));
    if (normalizePath(relative(root, fullPath)) !== asset || !(await stat(fullPath)).isFile()) throw new Error(`Invalid catalogue asset: ${asset}`);
  }
  const pageBySource = new Map(pages.map(page => [page.source, page]));
  for (const link of localLinks) {
    if (!link.hash || !pageBySource.has(link.target)) continue;
    const id = decodeURIComponent(link.hash.slice(1));
    if (!pageBySource.get(link.target).headings.some(heading => heading.id === id)) {
      throw new Error(`Unknown heading in ${link.source}: ${link.target}${link.hash}`);
    }
  }
  return { pages, assets: [...assets].sort() };
}
