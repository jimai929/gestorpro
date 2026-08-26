// Uso: node scripts/docs/manual-a-html.js <manual.md> <salida.html> [es|zh]
//   es → docs/MANUAL_USUARIO.md   ·   zh → docs/MANUAL_USUARIO.zh.md
// Genera la página del manual para el cliente (artifact). Sigue docs/DESIGN_SYSTEM.md
// (tokens claro/oscuro de global.css, Inter para UI, Source Serif 4 para lectura;
// en chino añade Noto Sans/Serif SC). Sin dependencias. Excluye los anexos B y C
// (internos), conserva la línea de versión.
const fs = require('fs');
const [,, inPath, outPath, langArg] = process.argv;
const lang = langArg === 'zh' ? 'zh' : 'es';
let md = fs.readFileSync(inPath, 'utf8').replace(/\r\n/g, '\n');

// Textos de la página (cabecera, índice, pie) por idioma.
const UI = {
  es: { title: 'Manual de GestorPro', h1: 'Manual de usuario', meta: 'Guía por tareas para el dueño, los supervisores y el personal', contenido: 'Contenido', indice: 'Índice del manual', pie: 'Los textos en negrita reproducen exactamente lo que se ve en pantalla.', htmlLang: 'es' },
  zh: { title: 'GestorPro 使用手册', h1: '使用手册', meta: '面向业主、主管和员工的分任务指南', contenido: '目录', indice: '手册目录', pie: '加粗文字与屏幕上显示的内容完全一致。', htmlLang: 'zh-CN' },
}[lang];

// --- recortar Anexo B..C (internos), conservar la línea de versión ---
const versionLine = (md.match(lang === 'zh' ? /^手册版本[:：].*$/m : /^Versión del manual:.*$/m) || [''])[0];
const iB = md.indexOf(lang === 'zh' ? '\n## 附录 B' : '\n## Anexo B');
if (iB > 0) md = md.slice(0, iB) + '\n';

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// --- primer paso: mapa número de sección → id (para enlaces cruzados) ---
const lines = md.split('\n');
const secIds = {}; // "2.1" → id, "Anexo A" → id
const headings = []; // {level, text, id}
for (const l of lines) {
  const m = l.match(/^(#{2,3}) (.+)$/);
  if (!m) continue;
  const text = m[2].trim();
  const id = slug(text);
  headings.push({ level: m[1].length, text, id });
  const n = text.match(/^(\d+(?:\.\d+)?)\.?\s/);
  if (n) secIds[n[1]] = id;
  const a = text.match(/^(Anexo [A-C]|附录 [A-C])/);
  if (a) secIds[a[1]] = id;
}

function inline(s) {
  let t = esc(s);
  t = t.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*\w])\*([^*\n]+?)\*(?=[^*\w]|$)/g, '$1<em>$2</em>');
  // enlaces a secciones: "(3.4)", "ver 6.2", "Detalle en 6.1", "sección 4.6", "capítulo 7"
  t = t.replace(/(\(|（|ver |Detalle en |sección |capítulo |Vaya a |见 ?|详见 ?|参见 ?)(\d+(?:\.\d+)?|Anexo [A-C]|附录 [A-C])(?=[\s).,;:）。，；、]|$)/g, (m0, pre, num) =>
    secIds[num] ? `${pre}<a href="#${secIds[num]}">${num}</a>` : m0);
  return t;
}

// --- parser de bloques (recursivo para blockquotes y listas anidadas) ---
function parseBlocks(ls) {
  const out = [];
  let i = 0;
  while (i < ls.length) {
    const l = ls[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = l.match(/^(#{1,3}) (.+)$/))) {
      const lvl = m[1].length, text = m[2].trim();
      if (lvl === 1) { i++; continue; } // el título va en la cabecera
      out.push(`<h${lvl} id="${slug(text)}">${inline(text)}</h${lvl}>`);
      i++; continue;
    }
    if (/^---+$/.test(l.trim())) { out.push('<hr>'); i++; continue; }
    if (l.startsWith('|')) {
      const rows = [];
      while (i < ls.length && ls[i].startsWith('|')) rows.push(ls[i++]);
      const cells = r => r.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
      const head = cells(rows[0]);
      const body = rows.slice(rows[1] && /^\|?\s*:?-{2,}/.test(rows[1]) ? 2 : 1).map(cells);
      let h = '<div class="tabla"><table><thead><tr>' + head.map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>';
      for (const r of body) h += '<tr>' + r.map((c, k) => `<td${k === 0 ? ' class="c1"' : ''}>${inline(c)}</td>`).join('') + '</tr>';
      out.push(h + '</tbody></table></div>');
      continue;
    }
    if (l.startsWith('>')) {
      const inner = [];
      while (i < ls.length && ls[i].startsWith('>')) inner.push(ls[i++].replace(/^> ?/, ''));
      const first = inner[0] || '';
      const tipo = /^\*\*(Aviso|Importante|Recomendaci|En GestorPro nada|Contado vs|重要|注意|提示|建议|关于|在 GestorPro|现付|现金)/i.test(first) ? ' aviso' : '';
      out.push(`<aside class="nota${tipo}">${parseBlocks(inner).join('\n')}</aside>`);
      continue;
    }
    if (/^(\s*)([-*]|\d+\.) /.test(l)) {
      const items = []; // {indent, ordered, lines[]}
      while (i < ls.length) {
        const cur = ls[i];
        const mm = cur.match(/^(\s*)([-*]|\d+\.) (.*)$/);
        if (mm) { items.push({ indent: mm[1].length, ordered: /\d/.test(mm[2]), lines: [mm[3]] }); i++; continue; }
        if (cur.trim() && /^\s{2,}/.test(cur) && items.length) { items[items.length - 1].lines.push(cur.trim()); i++; continue; }
        break;
      }
      out.push(renderList(items, 0));
      continue;
    }
    // párrafo
    const p = [];
    while (i < ls.length && ls[i].trim() && !/^(#{1,3} |\||>|---|\s*([-*]|\d+\.) )/.test(ls[i])) p.push(ls[i++].trim());
    if (p.length) {
      const txt = p.join(' ');
      // "Roles: ..." como etiqueta; "Pasos:", "Errores frecuentes:", etc. como subtítulos
      if (/^(Roles?: |角色[:：])/.test(txt)) out.push(`<p class="roles">${inline(txt)}</p>`);
      else if (/^\*\*(Pasos|Errores frecuentes|Qué verá al terminar|Tenga en cuenta|Ejemplo|Cómo leer este manual|步骤|常见错误|完成后您会看到|请注意|示例|如何阅读本手册)[^*]*\*\*[:：]?$/.test(txt)) out.push(`<p class="sub">${inline(txt.replace(/\*\*/g, ''))}</p>`);
      else out.push(`<p>${inline(txt)}</p>`);
    }
  }
  return out;
}

function renderList(items, from) {
  // items desde `from` con el mismo indent forman una lista; los de indent mayor van anidados
  const base = items[from].indent;
  const ordered = items[from].ordered;
  let h = ordered ? '<ol>' : '<ul>';
  let k = from;
  while (k < items.length && items[k].indent >= base) {
    if (items[k].indent > base) { k++; continue; }
    let li = `<li>${inline(items[k].lines.join(' '))}`;
    // anidados inmediatamente después
    let j = k + 1;
    if (j < items.length && items[j].indent > base) {
      li += renderList(items, j);
      while (j < items.length && items[j].indent > base) j++;
    }
    li += '</li>';
    h += li;
    k = j;
  }
  return h + (ordered ? '</ol>' : '</ul>');
}

const body = parseBlocks(lines).join('\n');

// --- índice lateral ---
let toc = '';
for (const h of headings) {
  if (/^(Anexo|附录) [BC]/.test(h.text)) continue;
  toc += `<li class="l${h.level}"><a href="#${h.id}">${esc(h.text)}</a></li>`;
}

const fuentes = lang === 'zh'
  ? 'family=Inter:wght@400;500;600&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&family=Noto+Sans+SC:wght@400;500&family=Noto+Serif+SC:wght@400;600'
  : 'family=Inter:wght@400;500;600&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400';
const html = `<title>${UI.title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${fuentes}&display=swap">
<style>
:root{
  --bg:#F7F8FA; --surface:#FFFFFF; --raised:#EFF2F6; --border:#E3E6EA; --border-strong:#CBD1D8;
  --text:#1A1D21; --text-2:#5A6472; --text-3:#8A929E;
  --primary:#1E3A5F; --primary-bg:#EAF0F6; --link:#1E3A5F;
  --warn:#8A5A12; --warn-bg:#FBF1E0; --warn-border:#EBD2A4;
  --code-bg:#EFF2F6; --rail:#151413; --rail-text:#A79E92; --rail-active:#E0A96A;
  --serif:'Source Serif 4', 'Noto Serif SC', Georgia, 'Times New Roman', 'Songti SC', 'SimSun', serif;
  --sans:'Inter', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', Roboto, Helvetica, Arial, sans-serif;
}
@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]){
  --bg:#1A1917; --surface:#232120; --raised:#2A2724; --border:#34312E; --border-strong:#413D39;
  --text:#F0EBE4; --text-2:#A79E92; --text-3:#8A8175;
  --primary:#E0A96A; --primary-bg:#2E2724; --link:#E0A96A;
  --warn:#E0A94F; --warn-bg:#2E2820; --warn-border:#4A3D26; --code-bg:#2A2724;
}}
:root[data-theme="dark"]{
  --bg:#1A1917; --surface:#232120; --raised:#2A2724; --border:#34312E; --border-strong:#413D39;
  --text:#F0EBE4; --text-2:#A79E92; --text-3:#8A8175;
  --primary:#E0A96A; --primary-bg:#2E2724; --link:#E0A96A;
  --warn:#E0A94F; --warn-bg:#2E2820; --warn-border:#4A3D26; --code-bg:#2A2724;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:var(--serif);font-size:17px;line-height:1.6;-webkit-font-smoothing:antialiased}
a{color:var(--link)}
a:focus-visible,button:focus-visible,summary:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
.cab{background:var(--rail);color:#F0EBE4;font-family:var(--sans)}
.cab .in{max-width:1180px;margin:0 auto;padding:28px 24px;display:flex;flex-wrap:wrap;align-items:baseline;gap:8px 24px}
.cab .logo{display:inline-flex;align-items:center;gap:10px;font-weight:500;font-size:15px;letter-spacing:.02em;color:var(--rail-text)}
.cab .logo b{display:inline-grid;place-items:center;width:28px;height:28px;border-radius:7px;background:var(--rail-active);color:#151413;font-weight:600;font-size:13px}
.cab h1{margin:0;font-family:var(--sans);font-weight:500;font-size:clamp(22px,3vw,30px);letter-spacing:-.01em;color:#F0EBE4;flex-basis:100%;text-wrap:balance}
.cab .meta{font-size:13px;color:var(--rail-text)}
.cab .meta span+span::before{content:"·";margin:0 8px;color:#5A544D}
.marco{max-width:1180px;margin:0 auto;padding:0 24px;display:grid;grid-template-columns:260px minmax(0,1fr);gap:48px}
nav.indice{position:sticky;top:0;align-self:start;max-height:100vh;overflow-y:auto;padding:28px 0 40px;font-family:var(--sans);font-size:13px;border-right:1px solid var(--border)}
nav.indice .t{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--text-3);margin:0 0 10px}
nav.indice ul{list-style:none;margin:0;padding:0 16px 0 0}
nav.indice li a{display:block;color:var(--text-2);text-decoration:none;padding:4px 8px;border-radius:6px;line-height:1.35}
nav.indice li.l2{margin-top:10px}
nav.indice li.l2 a{color:var(--text);font-weight:500}
nav.indice li.l3 a{padding-left:18px}
nav.indice li a:hover{background:var(--raised)}
nav.indice li a.activo{background:var(--primary-bg);color:var(--primary)}
nav.indice details{display:none}
main{max-width:70ch;padding:28px 0 80px}
main h2{font-family:var(--sans);font-weight:500;font-size:24px;letter-spacing:-.01em;margin:56px 0 12px;padding-top:20px;border-top:1px solid var(--border);text-wrap:balance;scroll-margin-top:16px}
main h2:first-of-type{margin-top:12px;border-top:0;padding-top:0}
main h3{font-family:var(--sans);font-weight:500;font-size:18px;margin:36px 0 8px;color:var(--text);text-wrap:balance;scroll-margin-top:16px}
main p{margin:0 0 14px}
main strong{font-family:var(--sans);font-weight:500;font-size:.94em;color:var(--text)}
main em{font-style:italic}
main code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.86em;background:var(--code-bg);padding:1px 5px;border-radius:4px}
main ul,main ol{margin:0 0 14px;padding-left:26px}
main li{margin:0 0 6px}
main li>ul,main li>ol{margin-top:6px}
main ol>li::marker{font-family:var(--sans);font-weight:500;color:var(--primary)}
main hr{border:0;height:0;margin:0}
p.roles{font-family:var(--sans);font-size:13px;color:var(--text-2);margin:-2px 0 14px}
p.roles strong{font-size:1em;background:var(--primary-bg);color:var(--primary);padding:2px 8px;border-radius:999px}
p.sub{font-family:var(--sans);font-weight:500;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--text-2);margin:18px 0 8px}
aside.nota{background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--primary);border-radius:8px;padding:14px 18px;margin:0 0 18px;font-size:.97em}
aside.nota.aviso{background:var(--warn-bg);border-color:var(--warn-border);border-left-color:var(--warn)}
aside.nota p:last-child,aside.nota ol:last-child,aside.nota ul:last-child{margin-bottom:0}
.tabla{overflow-x:auto;margin:0 0 18px;border:1px solid var(--border);border-radius:8px;background:var(--surface)}
table{border-collapse:collapse;width:100%;font-family:var(--sans);font-size:14px;line-height:1.45}
th,td{text-align:left;vertical-align:top;padding:9px 12px;border-bottom:1px solid var(--border)}
th{background:var(--raised);font-weight:500;color:var(--text-2);font-size:12.5px;letter-spacing:.02em;white-space:nowrap}
tr:last-child td{border-bottom:0}
td.c1{font-weight:500}
td strong{font-size:1em}
.pie{font-family:var(--sans);font-size:13px;color:var(--text-3);border-top:1px solid var(--border);padding-top:16px;margin-top:48px}
@media (max-width: 900px){
  .marco{grid-template-columns:1fr;gap:0}
  nav.indice{position:static;max-height:none;border-right:0;border-bottom:1px solid var(--border);padding:16px 0}
  nav.indice ul{padding:0}
  nav.indice>ul,nav.indice>.t{display:none}
  nav.indice details{display:block}
  nav.indice summary{cursor:pointer;font-weight:500;color:var(--text);padding:6px 0}
  main{padding-top:20px}
  body{font-size:16px}
}
@media (prefers-reduced-motion: no-preference){ html{scroll-behavior:smooth} }
@media print{
  .cab{background:#fff;color:#000;border-bottom:1px solid #999}
  .cab h1,.cab .logo,.cab .meta{color:#000}
  nav.indice{display:none}
  .marco{display:block;max-width:none;padding:0}
  main{max-width:none}
  main h2{break-before:page;border-top:0}
  main h2:first-of-type{break-before:auto}
  aside.nota,.tabla{break-inside:avoid}
  a{color:inherit;text-decoration:none}
}
</style>
<header class="cab" lang="${UI.htmlLang}"><div class="in">
  <span class="logo"><b>GP</b> GestorPro</span>
  <h1>${UI.h1}</h1>
  <p class="meta"><span>${UI.meta}</span><span>${esc(versionLine.replace(/^(Versión del manual:|手册版本[:：])\s*/, ''))}</span></p>
</div></header>
<div class="marco" lang="${UI.htmlLang}">
<nav class="indice" aria-label="${UI.contenido}">
  <p class="t">${UI.contenido}</p>
  <ul>${toc}</ul>
  <details><summary>${UI.indice}</summary><ul>${toc}</ul></details>
</nav>
<main>
${body}
<p class="pie">${esc(versionLine)}${lang === 'zh' ? '。' : '.'} ${UI.pie}</p>
</main>
</div>
<script>
(function(){
  var links=[].slice.call(document.querySelectorAll('nav.indice > ul a'));
  var map={};links.forEach(function(a){map[a.getAttribute('href').slice(1)]=a;});
  var hs=[].slice.call(document.querySelectorAll('main h2, main h3'));
  if(!('IntersectionObserver' in window)||!hs.length)return;
  var actual=null;
  function marcar(id){if(actual===id)return;actual=id;links.forEach(function(a){a.classList.toggle('activo',a.getAttribute('href')==='#'+id);});}
  var obs=new IntersectionObserver(function(es){
    var vis=es.filter(function(e){return e.isIntersecting;}).sort(function(a,b){return a.boundingClientRect.top-b.boundingClientRect.top;});
    if(vis.length)marcar(vis[0].target.id);
  },{rootMargin:'-10% 0px -75% 0px',threshold:0});
  hs.forEach(function(h){obs.observe(h);});
})();
</script>
`;
fs.writeFileSync(outPath, html);
console.log('ok', outPath, html.length, 'chars;', headings.length, 'encabezados;', Object.keys(secIds).length, 'ids de sección');
