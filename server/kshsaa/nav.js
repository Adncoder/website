// The bar across the top of every KSHSAA page: the logo, the sections, and a
// way back to QBReader. Put KSHSAA_HEAD in a page's <head> and
// ${kshsaaNav('/kshsaa-stats')} where the bar goes. The Spanish practice page
// is a static file (client/kshsaa-spanish/) and carries its own copy.

const SECTIONS = [
  ['/kshsaa-play', 'Read a round'],
  ['/kshsaa-round', 'Download packet'],
  ['/kshsaa-stats', 'Practice stats'],
  ['/kshsaa-questions', 'Question bank'],
  ['/kshsaa-spanish/', 'Spanish Practice']
];

export const KSHSAA_HEAD = `<link rel="icon" href="/kshsaa/logo.svg" type="image/svg+xml">
<style>
 .kshsaa-bar{background:#eef1f7;border-bottom:1px solid #d9e0ec}
 .kshsaa-bar a{color:#4a5b7d;text-decoration:none;margin:0 .85rem;font-size:.9rem}
 .kshsaa-bar a:hover{color:#1f3864;text-decoration:underline}
 .kshsaa-bar a.active{color:#1f3864;font-weight:600}
 /* three columns so the section links stay centred on the page whatever the
    width of the logo on the left and the QBReader link on the right */
 .kshsaa-nav{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:.25rem}
 .kshsaa-nav .kshsaa-links{grid-column:2;display:flex;flex-wrap:wrap;justify-content:center;gap:.35rem 0}
 .kshsaa-bar a.kshsaa-brand{justify-self:start;display:inline-flex;align-items:center;gap:.4rem;margin-left:0;
   font-family:Inter,'Source Sans Pro',system-ui,sans-serif;font-weight:700;font-size:1.1rem;white-space:nowrap}
 .kshsaa-bar a.kshsaa-brand:hover{text-decoration:none}
 .kshsaa-brand img{width:26px;height:26px}
 .kshsaa-brand .pre{color:#1f5fd1}
 .kshsaa-brand .suf{color:#1f2733}
 .kshsaa-bar a.kshsaa-home{justify-self:end;margin-right:0;white-space:nowrap;font-size:.8rem}
 @media (max-width:900px){
   .kshsaa-nav{grid-template-columns:1fr;justify-items:center;gap:.35rem}
   .kshsaa-nav .kshsaa-links,.kshsaa-bar a.kshsaa-brand,.kshsaa-bar a.kshsaa-home{grid-column:1;justify-self:center}
 }
</style>`;

/**
 * @param {string} active - the section's path, to mark it current
 * @param {number} [maxWidth] - match the page's own container width
 * @returns {string} HTML
 */
export function kshsaaNav (active, maxWidth = 1100) {
  const links = SECTIONS
    .map(([href, label]) => `<a href="${href}"${href === active ? ' class="active"' : ''}>${label}</a>`)
    .join('\n      ');
  return `<div class="kshsaa-bar py-2 mb-3">
  <div class="container kshsaa-nav" style="max-width:${maxWidth}px">
    <a class="kshsaa-brand" href="/kshsaa-play"><img src="/kshsaa/logo.svg" alt=""><span><span class="pre">Scholars</span> <span class="suf">Bowl</span></span></a>
    <span class="kshsaa-links">
      ${links}
    </span>
    <a class="kshsaa-home" href="/">QBReader &rarr;</a>
  </div>
</div>`;
}
