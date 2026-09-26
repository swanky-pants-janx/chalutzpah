// /join/CODE → this page. Chat apps (Discord, WhatsApp…) read the meta tags to
// show a rich preview of the table; people are sent straight on to join it.

import { codeFrom, describe, fetchPreview } from './_lib/preview.js';

export const config = { runtime: 'edge' };

const escape = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export default async function handler(request) {
  const code = codeFrom(request.url);
  const origin = new URL(request.url).origin;
  const preview = await fetchPreview(code);
  const { title, description } = describe(preview, code);
  const target = code ? `/?join=${code}` : '/';
  const version = preview ? `${preview.mapNumber}-${preview.players.length}-${preview.status}` : 'none';
  const image = `${origin}/api/og?code=${code}&v=${encodeURIComponent(version)}`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Chalutzpah">
<meta property="og:title" content="${escape(title)}">
<meta property="og:description" content="${escape(description)}">
<meta property="og:url" content="${escape(`${origin}/join/${code}`)}">
<meta property="og:image" content="${escape(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#e0773f">
<meta http-equiv="refresh" content="0; url=${escape(target)}">
</head>
<body style="background:#121a24;color:#f7efdc;font-family:system-ui,sans-serif">
<p>Taking you to the table… <a href="${escape(target)}" style="color:#eaa53a">continue</a></p>
<script>location.replace(${JSON.stringify(target)})</script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=0, s-maxage=30' },
  });
}
