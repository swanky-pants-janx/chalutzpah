// Preview image for invite links (1200×630): the actual island, the host, the
// code and who's seated. Rendered with @vercel/og (satori + resvg).

import { ImageResponse } from '@vercel/og';
import { geometryFor } from '../src/components/board/geometry.js';
import { PLAYER_COLORS } from '../src/lib/theme.js';
import { boardSvg, tokenPositions } from './_lib/board-svg.js';
import { codeFrom, fetchPreview } from './_lib/preview.js';

export const config = { runtime: 'edge' };

const WIDTH = 1200;
const HEIGHT = 630;

/** Fit the island into the left of the card (the grand island is taller). */
function boardBox(board) {
  const vb = geometryFor(board.layout).viewBox;
  const scale = Math.min(660 / vb.width, 620 / vb.height);
  const width = vb.width * scale;
  const height = vb.height * scale;
  return { vb, scale, width, height, x: 10 + (660 - width) / 2, y: (HEIGHT - height) / 2 };
}

/** Minimal element helper: satori wants display:flex on anything with children. */
const el = (style, ...children) => ({ type: 'div', props: { style: { display: 'flex', ...style }, children } });

async function loadInter(weight) {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Inter:wght@${weight}`)).text();
    const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
    return url ? await (await fetch(url)).arrayBuffer() : null;
  } catch {
    return null;
  }
}

function toBase64(text) {
  return typeof Buffer !== 'undefined' ? Buffer.from(text).toString('base64') : btoa(unescape(encodeURIComponent(text)));
}

function boardLayer(board) {
  const box = boardBox(board);
  const size = box.scale > 0.5 ? 36 : 30;
  const tokens = tokenPositions(board).map((t) =>
    el(
      {
        position: 'absolute',
        left: box.x + (t.x - box.vb.x) * box.scale - size / 2,
        top: box.y + (t.y - box.vb.y) * box.scale - size / 2,
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size > 32 ? 20 : 16,
        fontWeight: 900,
        color: t.number === 6 || t.number === 8 ? '#b3263e' : '#2b2118',
      },
      String(t.number),
    ),
  );
  return [
    {
      type: 'img',
      props: {
        src: `data:image/svg+xml;base64,${toBase64(boardSvg(board))}`,
        width: box.width,
        height: box.height,
        style: { position: 'absolute', left: box.x, top: box.y },
      },
    },
    ...tokens,
  ];
}

function sidePanel(preview, code) {
  const eyebrow = el({ fontSize: 22, fontWeight: 700, letterSpacing: 6, color: '#eaa53a' }, 'CHALUTZPAH');
  if (!preview) {
    return el(
      { flexDirection: 'column', gap: 24 },
      eyebrow,
      el({ fontSize: 60, fontWeight: 900, color: '#fff4dc', lineHeight: 1.05 }, 'Settle the land. Trade with nerve.'),
      el({ fontSize: 28, color: 'rgba(247,239,220,0.7)' }, 'A hex-settling game for friends'),
    );
  }
  const { host, players, settings, mapNumber, status } = preview;
  const headline = status === 'lobby' ? `${host}'s table` : status === 'finished' ? 'Game over' : `${host}'s game`;
  const sub =
    status === 'lobby'
      ? `${players.length} of ${settings.maxPlayers} seats taken — join in!`
      : status === 'finished'
        ? `${preview.winner ?? 'Someone'} claimed the land`
        : 'Under way';
  return el(
    { flexDirection: 'column', gap: 22 },
    eyebrow,
    el({ fontSize: 58, fontWeight: 900, color: '#fff4dc', lineHeight: 1.05 }, headline),
    el(
      { alignSelf: 'flex-start', padding: '8px 22px', borderRadius: 25, background: '#f7efdc', color: '#b3263e', fontSize: 54, fontWeight: 900, letterSpacing: 10 },
      code,
    ),
    el({ fontSize: 24, fontWeight: 700, color: '#f3c060' }, sub),
    el(
      { flexWrap: 'wrap', gap: 12 },
      ...players.map((p) =>
        el(
          { alignItems: 'center', gap: 10, padding: '8px 16px', borderRadius: 25, background: 'rgba(255,255,255,0.08)', fontSize: 24, color: '#f7efdc' },
          el({ width: 18, height: 18, borderRadius: 9, background: PLAYER_COLORS[p.color]?.fill ?? '#888', border: '2px solid rgba(0,0,0,0.3)' }),
          p.name,
        ),
      ),
    ),
    el(
      { fontSize: 22, color: 'rgba(247,239,220,0.6)' },
      [`First to ${settings.vpTarget}`, `Map No. ${mapNumber}`, settings.chaos && 'Chaos mode', settings.turnTimer && `${settings.turnTimer}s turns`]
        .filter(Boolean)
        .join(' · '),
    ),
  );
}

export default async function handler(request) {
  const code = codeFrom(request.url);
  const [preview, bold, black] = await Promise.all([fetchPreview(code), loadInter(700), loadInter(900)]);
  const fonts = [
    bold && { name: 'Inter', data: bold, weight: 700, style: 'normal' },
    black && { name: 'Inter', data: black, weight: 900, style: 'normal' },
  ].filter(Boolean);

  const image = el(
    {
      position: 'relative',
      width: WIDTH,
      height: HEIGHT,
      fontFamily: fonts.length ? 'Inter' : undefined,
      background: 'radial-gradient(circle at 20% 0%, #3a2c1c 0%, #121a24 55%)',
    },
    ...(preview ? boardLayer(preview.board) : []),
    el({ position: 'absolute', left: preview ? 690 : 80, top: 0, bottom: 0, right: 50, alignItems: 'center' }, sidePanel(preview, code)),
  );

  return new ImageResponse(image, {
    width: WIDTH,
    height: HEIGHT,
    fonts: fonts.length ? fonts : undefined,
    headers: { 'cache-control': 'public, max-age=60, s-maxage=60' },
  });
}
