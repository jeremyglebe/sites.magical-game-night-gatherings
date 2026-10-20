import { randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const avatarIds = Object.freeze([
  'robot-orc', 'robot-wizard', 'robot-dwarf', 'robot-elf-ranger',
  'robot-knight', 'robot-rogue', 'robot-cleric', 'robot-bard',
]);
const knownAvatars = new Set(avatarIds);

export function assignAvatars(players) {
  const used = new Set();
  // Reserve existing choices first so a missing avatar cannot steal a later
  // player's saved identity when an older match is loaded.
  const assigned = players.map(player => {
    const avatar = knownAvatars.has(player.avatar) && !used.has(player.avatar) ? player.avatar : null;
    if (avatar) used.add(avatar);
    return { ...player, avatar };
  });
  const available = avatarIds.filter(id => !used.has(id));
  for (let i = available.length - 1; i > 0; i--) {
    const other = randomInt(i + 1);
    [available[i], available[other]] = [available[other], available[i]];
  }
  for (const player of assigned) {
    if (!player.avatar && player.ai !== false) player.avatar = available.pop() || null;
  }
  // More seats remain valid: the viewer uses their seat-number badges after
  // the portrait pack is exhausted instead of repeating another player's face.
  return assigned;
}

export function serveAvatar(pathname, response) {
  if (!pathname.startsWith('/avatars/')) return false;
  const id = pathname.slice('/avatars/'.length).replace(/\.png$/, '');
  if (knownAvatars.has(id) && pathname === `/avatars/${id}.png`) {
    try {
      const image = readFileSync(new URL(`./avatars/${id}.png`, import.meta.url));
      response.writeHead(200, {
        'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(image);
      return true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  response.writeHead(404, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
  response.end('Avatar not found');
  return true;
}
