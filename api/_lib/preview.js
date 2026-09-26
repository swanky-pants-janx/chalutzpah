// Shared by the invite page (api/invite.js) and its preview image (api/og.js).

const CODE_PATTERN = /^[2-9A-HJ-NP-Z]{5}$/;

export function codeFrom(requestUrl) {
  const url = new URL(requestUrl);
  const raw = url.searchParams.get('code') ?? url.pathname.match(/\/join\/([^/?#]+)/)?.[1] ?? '';
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
}

/** Ask the game server for the public summary of a table (island, names, settings). */
export async function fetchPreview(code) {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!CODE_PATTERN.test(code) || !url || !key) return null;
  try {
    const res = await fetch(`${url}/functions/v1/game`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ op: 'preview', code }),
    });
    const data = await res.json();
    return data?.ok ? data.preview : null;
  } catch {
    return null;
  }
}

const HOUSE_RULE_NAMES = { closeNeighbours: 'Close neighbours', watchmanChoice: 'Choosy Watchman' };

/** Title + description for the link preview. */
export function describe(preview, code) {
  if (!preview) {
    return {
      title: 'Chalutzpah — a hex-settling game for friends',
      description: 'Settle the land, trade with nerve, build with chutzpah. Play in your browser.',
    };
  }
  const { host, players, settings, mapNumber, status, winner } = preview;
  const extras = [];
  if (settings.chaos) extras.push('chaos mode');
  if (settings.turnTimer) extras.push(`${settings.turnTimer}s turns`);
  const rules = Object.keys(HOUSE_RULE_NAMES).filter((k) => settings[k]).map((k) => HOUSE_RULE_NAMES[k]);
  if (rules.length) extras.push(`house rules: ${rules.join(', ')}`);
  const tail = extras.length ? ` · ${extras.join(' · ')}` : '';

  if (status === 'lobby') {
    const open = settings.maxPlayers - players.length;
    return {
      title: `Join ${host}'s Chalutzpah table`,
      description: `Code ${code} · ${players.length}/${settings.maxPlayers} settlers${open > 0 ? '' : ' (full)'} · first to ${settings.vpTarget} points · Map No. ${mapNumber}${tail}`,
    };
  }
  if (status === 'finished') {
    return {
      title: `${winner ?? 'Someone'} won ${host}'s Chalutzpah game`,
      description: `${players.map((p) => p.name).join(', ')} · Map No. ${mapNumber}`,
    };
  }
  return {
    title: `${host}'s Chalutzpah game is under way`,
    description: `${players.map((p) => p.name).join(', ')} · first to ${settings.vpTarget} points · Map No. ${mapNumber}${tail}`,
  };
}
