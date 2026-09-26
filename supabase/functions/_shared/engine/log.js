// Event log. Entries are arrays of "parts" so the UI can render player names,
// resource icons and dice without parsing strings:
//   string | { p: playerId, name } | { r: bundle } | { res: resource } | { dice: [a, b] }

import { LOG_LIMIT, PRIVATE_LOG_LIMIT } from './constants.js';
import { compact } from './hand.js';

export function P(s, idx) {
  const player = s.players[idx];
  return { p: player.id, name: player.name };
}

export const B = (bundle) => ({ r: compact(bundle) });

export function log(s, parts, kind = 'info') {
  s.logSeq += 1;
  s.log.push({ seq: s.logSeq, kind, parts });
  if (s.log.length > LOG_LIMIT) s.log.splice(0, s.log.length - LOG_LIMIT);
}

/** A message only one player can see (stored in their private view). */
export function whisper(s, idx, parts, kind = 'private') {
  const id = s.players[idx].id;
  s.logSeq += 1;
  const list = (s.privateLog[id] ??= []);
  list.push({ seq: s.logSeq, kind, parts, private: true });
  if (list.length > PRIVATE_LOG_LIMIT) list.splice(0, list.length - PRIVATE_LOG_LIMIT);
}
