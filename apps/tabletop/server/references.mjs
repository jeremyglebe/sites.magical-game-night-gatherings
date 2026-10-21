import { readFileSync, realpathSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../..'));

// Expand the same shared text used by VitePress, rather than returning a
// placeholder where the actual turn procedure should be.
export function referenceLines(path, ancestors = []) {
  const fullPath = realpathSync(resolve(project, path));
  const local = relative(project, fullPath).split(sep).join('/');
  if (!/^(formats|rules|boxed-sets|\.vitepress\/partials)\/.*\.md$/.test(local)) throw new Error('Invalid reference path');
  if (ancestors.includes(fullPath)) throw new Error('Circular reference include');
  return readFileSync(fullPath, 'utf8').split('\n').flatMap(line => {
    const include = line.match(/^\s*<!--\s*@include:\s*(.*?)\s*-->\s*$/);
    if (!include) return [line];
    return referenceLines(relative(project, resolve(dirname(fullPath), include[1])), [...ancestors, fullPath]);
  });
}
