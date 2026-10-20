import { mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { defaultRulesPath, officialRulesURL } from './rules.mjs';

function officialURL(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !['magic.wizards.com', 'media.wizards.com', 'www.wizards.com'].includes(url.hostname)
    || url.username || url.password || (url.port && url.port !== '443')) {
    throw new Error('Rules downloads must stay on official HTTPS Wizards hosts');
  }
  return url;
}

async function officialText(value, fetchImpl) {
  let url = officialURL(value);
  for (let redirects = 0; redirects <= 5; redirects++) {
    const response = await fetchImpl(url.href, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Rules download redirected without a destination');
      url = officialURL(new URL(location, url).href);
      continue;
    }
    if (!response.ok) throw new Error('Rules download failed: HTTP ' + response.status);
    const text = await response.text();
    if (Buffer.byteLength(text) > 20 * 1024 * 1024) throw new Error('Unexpectedly large rules download');
    return { url: url.href, text: text.replace(/^\uFEFF/, '') };
  }
  throw new Error('Too many rules download redirects');
}

export async function syncRules({ path = defaultRulesPath, fetchImpl = fetch } = {}) {
  const page = await officialText(officialRulesURL, fetchImpl);
  const candidates = [...page.text.matchAll(/href\s*=\s*["']([^"']+)["']/gi)]
    .map(match => match[1].replaceAll('&amp;', '&'))
    .map(href => new URL(href, page.url))
    .filter(url => /\.txt$/i.test(url.pathname) && /MagicCompRules/i.test(url.pathname));
  const links = [...new Set(candidates.map(url => officialURL(url.href).href))];
  if (links.length !== 1) throw new Error('Could not identify one official Comprehensive Rules TXT link');
  const download = await officialText(links[0], fetchImpl);
  if (!/^Magic: The Gathering Comprehensive Rules/m.test(download.text)
    || !/^117\. Timing and Priority/m.test(download.text)
    || !/^704\. State-Based Actions/m.test(download.text)) {
    throw new Error('Downloaded content is not recognized as the complete official Comprehensive Rules TXT');
  }
  const effective = download.text.split(/\r?\n/).slice(0, 30).find(line => /effective as of/i.test(line));
  if (!effective) throw new Error('Downloaded rules have no effective date');
  const metadata = {
    source_page: page.url, source_url: download.url, downloaded_at: new Date().toISOString(),
    effective, sha256: createHash('sha256').update(download.text).digest('hex'), bytes: Buffer.byteLength(download.text),
  };
  path = resolve(path);
  const temporary = path + '.' + randomUUID() + '.tmp';
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(temporary, download.text, { mode: 0o600 });
    await writeFile(temporary + '.json', JSON.stringify(metadata, null, 2) + '\n', { mode: 0o600 });
    await rename(temporary, path);
    await rename(temporary + '.json', path + '.json');
  } finally {
    await rm(temporary, { force: true });
    await rm(temporary + '.json', { force: true });
  }
  return { path, metadata_path: path + '.json', ...metadata };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { output: { type: 'string', default: defaultRulesPath } } });
  try {
    console.log(JSON.stringify(await syncRules({ path: values.output }), null, 2));
    console.log('This cache refresh does not update rules already pinned by an active match.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
