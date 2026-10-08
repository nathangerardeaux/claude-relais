// Relais dashboard (front). No framework, no external resource. Every piece of text coming from the
// logs is inserted as text (textContent), never as HTML.
import { t, definirLangue, locale, MARQUES, DEBUT } from './i18n.js';

// ------------------------------------------------------------------ language (before anything is drawn)
// The server tells the system language (French or English); reachable before sign-in.
definirLangue((await fetch('/api/langue').then((r) => r.json()).catch(() => ({}))).langue);
const LOC = locale();
document.documentElement.lang = LOC.slice(0, 2);
document.title = t('app.titre');
for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
for (const attr of ['placeholder', 'aria-label', 'title']) {
  for (const el of document.querySelectorAll(`[data-t-${attr}]`)) el.setAttribute(attr, t(el.getAttribute(`data-t-${attr}`)));
}

// ------------------------------------------------------------------ helpers
const $ = (s) => document.querySelector(s);
function h(tag, attrs = {}, ...enfants) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style') for (const [p, x] of Object.entries(v)) el.style.setProperty(p, x);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const e of enfants.flat()) if (e != null && e !== false) el.append(e instanceof Node ? e : String(e));
  return el;
}
const SVG = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}, ...enfants) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  for (const e of enfants) if (e != null) el.append(e instanceof Node ? e : String(e));
  return el;
}
const nf = new Intl.NumberFormat(LOC);
function fmt(n) {
  n = Number(n) || 0;
  if (n >= 999500000) return t('nb.milliards', { n: (n / 1e9).toLocaleString(LOC, { maximumFractionDigits: 2 }) });
  if (n >= 999500) return t('nb.millions', { n: (n / 1e6).toLocaleString(LOC, { maximumFractionDigits: n >= 1e8 ? 0 : 1 }) });
  if (n >= 1e3) return t('nb.milliers', { n: Math.round(n / 1e3).toLocaleString(LOC) });
  return nf.format(Math.round(n));
}
const total = (x) => (x?.in || 0) + (x?.out || 0) + (x?.read || 0) + (x?.create || 0);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const pc = (n) => t('nb.pct', { n }); // "42 %" in French, "42%" in English
const date = (ts) => (ts ? new Date(ts).toLocaleString(LOC, { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const heure = (ts) => (ts ? new Date(ts).toLocaleString(LOC, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
function duree(a, b) {
  const ms = new Date(b) - new Date(a);
  if (!(ms > 0)) return '';
  const m = Math.round(ms / 60000);
  if (m < 60) return t('duree.min', { n: m });
  if (m < 48 * 60) return t('duree.h', { n: Math.round(m / 60) });
  return t('duree.jours', { n: Math.round(m / 1440) });
}
const libre = (texte) => (MARQUES[texte] ? t(MARQUES[texte]) : texte); // analyse.mjs placeholders, translated
async function api(chemin, corps) {
  const r = await fetch(chemin, corps === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Relais': '1' }, body: JSON.stringify(corps),
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && j.connexion === false) verrouiller();
  if (!r.ok) throw Object.assign(new Error(j.message || j.erreur || t('commun.erreurHttp', { code: r.status })), { donnees: j });
  return j;
}
let toastMinuteur;
function toast(texte, erreur = false) {
  const z = $('#toast');
  z.textContent = texte; z.className = `toast${erreur ? ' erreur' : ''}`; z.hidden = false;
  clearTimeout(toastMinuteur); toastMinuteur = setTimeout(() => { z.hidden = true; }, 5000);
}
const bulle = $('#infobulle');
function montrerBulle(ev, ...contenu) {
  bulle.replaceChildren(...contenu); bulle.hidden = false;
  const x = Math.min(ev.clientX + 14, innerWidth - bulle.offsetWidth - 8);
  const y = Math.max(8, ev.clientY - bulle.offsetHeight - 12);
  bulle.style.left = `${x}px`; bulle.style.top = `${y}px`;
}
const cacherBulle = () => { bulle.hidden = true; };

const TYPES = ['read', 'create', 'in', 'out'].map((k, i) => ({ k, nom: t(`type.${k}`), c: `var(--serie-${i + 1})`, aide: t(`type.${k}.aide`) }));
function repartition(v) {
  const tot = total(v) || 1;
  return h('div', {},
    h('div', { class: 'repartition', role: 'img', 'aria-label': TYPES.map((x) => `${x.nom} ${pc(pct(v[x.k], tot))}`).join(', ') },
      TYPES.filter((x) => v[x.k] > 0).map((x) => h('div', {
        style: { background: x.c, flex: String(v[x.k]) },
        onmousemove: (ev) => montrerBulle(ev, h('b', {}, fmt(v[x.k])), ` ${x.nom} (${pc(pct(v[x.k], tot))})`, h('br'), h('span', { class: 'muet' }, x.aide)),
        onmouseleave: cacherBulle,
      }))),
    h('div', { class: 'legende' }, TYPES.map((x) => h('span', { style: { '--c': x.c } }, t('repartition.legende', { nom: x.nom, val: fmt(v[x.k]), pct: pc(pct(v[x.k], tot)) })))));
}

// ------------------------------------------------------------------ charts
const LARGEUR = 900;
function echelle(max) {
  const brut = max / 4 || 1;
  const p = 10 ** Math.floor(Math.log10(brut));
  const pas = [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= brut);
  return { pas, haut: Math.ceil(max / pas) * pas || pas };
}

function grapheBarres(donnees, { hauteur = 220, libelle = (d) => d.x, info }) {
  const m = { g: 52, d: 8, h: 10, b: 26 };
  const W = LARGEUR - m.g - m.d; const H = hauteur - m.h - m.b;
  const { pas, haut } = echelle(Math.max(...donnees.map((d) => d.y), 1));
  const svg = s('svg', { viewBox: `0 0 ${LARGEUR} ${hauteur}`, role: 'img', 'aria-label': t('graphe.barres') });
  for (let v = 0; v <= haut; v += pas) {
    const y = m.h + H - (v / haut) * H;
    svg.append(s('line', { class: 'ligne-grille', x1: m.g, x2: LARGEUR - m.d, y1: y, y2: y }), s('text', { class: 'axe', x: m.g - 8, y: y + 4, 'text-anchor': 'end' }, fmt(v)));
  }
  const bw = W / donnees.length;
  const largeurBarre = Math.max(2, Math.min(28, bw - 2));
  donnees.forEach((d, i) => {
    const x = m.g + i * bw + (bw - largeurBarre) / 2;
    const bh = (d.y / haut) * H;
    const y = m.h + H - bh;
    if (bh > 0) {
      const r = Math.min(4, largeurBarre / 2, bh);
      svg.append(s('path', { class: 'barre-val', d: `M${x},${m.h + H}V${y + r}a${r},${r} 0 0 1 ${r},-${r}H${x + largeurBarre - r}a${r},${r} 0 0 1 ${r},${r}V${m.h + H}Z` }));
    }
    const zone = s('rect', { x: m.g + i * bw, y: m.h, width: bw, height: H, fill: 'transparent' });
    zone.addEventListener('mousemove', (ev) => { montrerBulle(ev, ...info(d)); zone.previousSibling?.classList?.add?.('survol'); });
    zone.addEventListener('mouseleave', () => { cacherBulle(); zone.previousSibling?.classList?.remove?.('survol'); });
    svg.append(zone);
    const tous = Math.ceil(donnees.length / 10);
    if (i % tous === 0) svg.append(s('text', { class: 'axe', x: m.g + i * bw + bw / 2, y: hauteur - 6, 'text-anchor': 'middle' }, libelle(d)));
  });
  return h('div', { class: 'graphe' }, svg);
}

function grapheCourbe(points, { hauteur = 240, pas = 1, seuils = [] }) {
  const m = { g: 52, d: 12, h: 12, b: 26 };
  const W = LARGEUR - m.g - m.d; const H = hauteur - m.h - m.b;
  const max = Math.max(...points, ...seuils.map((x) => x.v * 1.08), 1);
  const { pas: pasY, haut } = echelle(max);
  const X = (i) => m.g + (points.length > 1 ? (i / (points.length - 1)) * W : W / 2);
  const Y = (v) => m.h + H - (v / haut) * H;
  const svg = s('svg', { viewBox: `0 0 ${LARGEUR} ${hauteur}`, role: 'img', 'aria-label': t('graphe.courbe') });
  for (let v = 0; v <= haut; v += pasY) svg.append(s('line', { class: 'ligne-grille', x1: m.g, x2: LARGEUR - m.d, y1: Y(v), y2: Y(v) }), s('text', { class: 'axe', x: m.g - 8, y: Y(v) + 4, 'text-anchor': 'end' }, fmt(v)));
  seuils.forEach((x, i) => { if (x.v <= haut) svg.append(s('line', { class: 'seuil', x1: m.g, x2: LARGEUR - m.d, y1: Y(x.v), y2: Y(x.v) }), s('text', { class: 'seuil-txt', x: m.g + 6, y: i % 2 ? Y(x.v) - 5 : Y(x.v) + 13 }, x.nom)); });
  if (points.length) {
    const dLigne = points.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
    svg.append(s('path', { class: 'aire', d: `${dLigne}L${X(points.length - 1)},${Y(0)}L${X(0)},${Y(0)}Z` }), s('path', { class: 'courbe', d: dLigne }));
  }
  const nAppels = points.length * pas;
  for (const f of [0, 0.25, 0.5, 0.75, 1]) svg.append(s('text', { class: 'axe', x: m.g + f * W, y: hauteur - 6, 'text-anchor': f === 0 ? 'start' : f === 1 ? 'end' : 'middle' }, t('graphe.appel', { n: nf.format(Math.round(f * nAppels)) })));
  const viseur = s('line', { class: 'viseur', y1: m.h, y2: m.h + H, visibility: 'hidden' });
  const point = s('circle', { class: 'point', r: 5, visibility: 'hidden' });
  const zone = s('rect', { x: m.g, y: m.h, width: W, height: H, fill: 'transparent' });
  zone.addEventListener('mousemove', (ev) => {
    const r = svg.getBoundingClientRect();
    const xv = ((ev.clientX - r.left) / r.width) * LARGEUR;
    const i = Math.max(0, Math.min(points.length - 1, Math.round(((xv - m.g) / W) * (points.length - 1))));
    viseur.setAttribute('x1', X(i)); viseur.setAttribute('x2', X(i)); viseur.setAttribute('visibility', 'visible');
    point.setAttribute('cx', X(i)); point.setAttribute('cy', Y(points[i])); point.setAttribute('visibility', 'visible');
    montrerBulle(ev, h('b', {}, fmt(points[i])), ` ${t('graphe.relusParAction')}`, h('br'), h('span', { class: 'muet' }, `${t('graphe.versAppel', { n: nf.format(i * pas + 1) })}${pas > 1 ? ` ${t('graphe.pic', { n: pas })}` : ''}`));
  });
  zone.addEventListener('mouseleave', () => { cacherBulle(); viseur.setAttribute('visibility', 'hidden'); point.setAttribute('visibility', 'hidden'); });
  svg.append(viseur, point, zone);
  return h('div', { class: 'graphe' }, svg);
}

function barresH(lignes, { valeur, texte, info }) {
  const max = Math.max(...lignes.map(valeur), 1);
  return h('div', { class: 'barres-h' }, lignes.flatMap((l) => [
    h('div', { class: 'nom', title: l.nom }, l.nom),
    h('div', { class: 'piste', onmousemove: info && ((ev) => montrerBulle(ev, ...info(l))), onmouseleave: info && cacherBulle },
      h('div', { class: 'rempli', style: { width: `${(valeur(l) / max) * 100}%` } })),
    h('div', { class: 'val' }, texte(l)),
  ]));
}

// ------------------------------------------------------------------ state + navigation
const etat = {
  conversations: [], ouverts: JSON.parse(localStorage.getItem('relais-onglets') || '[]'), actif: localStorage.getItem('relais-actif') || null,
  relais: { installe: false }, details: new Map(), page: localStorage.getItem('relais-page') || 'vue', avocat: { actif: false, installe: false },
};
function allerA(page) {
  etat.page = page; localStorage.setItem('relais-page', page);
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('actif', b.dataset.page === page));
  document.querySelectorAll('.page').forEach((p) => p.classList.toggle('actif', p.id === `page-${page}`));
  if (page === 'vue') afficherVue();
  if (page === 'skills') afficherSkills();
  if (page === 'gestion') afficherGestion();
  if (page === 'memoire') afficherMemoire();
  if (page === 'avocat') afficherAvocat();
  if (page === 'parametres') afficherParametres();
  if (page === 'conversations') { afficherListe(); afficherOnglets(); afficherDetail(); }
}
document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => allerA(b.dataset.page)));

// ------------------------------------------------------------------ tips
// Each tip is computed from the real figures and only shown when it applies.
function conseilRelais(partRelus) {
  if (!etat.relais.installe) {
    return { titre: t('conseil.relais.titre', { pct: pc(partRelus) }), texte: t('conseil.relais.texte'),
      action: [t('conseil.relais.action'), () => allerA('skills')] };
  }
  return { titre: t('conseil.relaisInstalle.titre', { pct: pc(partRelus) }), texte: t('conseil.relaisInstalle.texte') };
}
function conseilsGlobaux(convs, tReparti) {
  const l = [];
  const tot = total(tReparti);
  const partRelus = pct(tReparti.read, tot);
  if (tot && partRelus >= 60) l.push(conseilRelais(partRelus));
  const lourdes = convs.filter((c) => c.ctxMax >= 250000);
  if (lourdes.length) {
    l.push({ titre: t('conseil.lourdes.titre', { n: lourdes.length }), texte: t('conseil.lourdes.texte'),
      action: [t('conseil.lourdes.action'), () => { $('#tri').value = 'contexte'; allerA('conversations'); }] });
  }
  const longues = convs.filter((c) => new Date(c.fin) - new Date(c.debut) > 3 * 86400e3 && total(c.tot) > 1e8)
    .sort((a, b) => (new Date(b.fin) - new Date(b.debut)) - (new Date(a.fin) - new Date(a.debut)));
  if (longues.length) {
    const c = longues[0];
    l.push({ titre: t('conseil.longue.titre', { titre: c.titre.slice(0, 50), duree: duree(c.debut, c.fin) }),
      texte: t('conseil.longue.texte', { total: fmt(total(c.tot)) }),
      action: [t('commun.ouvrir'), () => ouvrir(c.id)] });
  }
  return l;
}
function conseilsConversation(d, tReparti) {
  const l = [];
  const tot = total(tReparti);
  const partRelus = pct(tReparti.read, tot);
  if (d.ctxMax >= 150000 && partRelus >= 60) l.push(conseilRelais(partRelus));
  const resultats = d.outils.reduce((a, o) => a + o.tokens, 0);
  const lecture = d.outils.find((o) => o.nom === 'Read');
  if (lecture && lecture.tokens > 100000 && lecture.tokens > resultats * 0.3) {
    l.push({ titre: t('conseil.lecture.titre', { tokens: fmt(lecture.tokens) }),
      texte: t('conseil.lecture.texte', { nb: nf.format(lecture.appels), n: lecture.appels, moy: fmt(lecture.tokens / lecture.appels) }) });
  }
  const shell = d.outils.filter((o) => /^(Bash|PowerShell)$/.test(o.nom)).reduce((a, o) => a + o.tokens, 0);
  if (shell > 100000) l.push({ titre: t('conseil.shell.titre', { tokens: fmt(shell) }), texte: t('conseil.shell.texte') });
  if (new Date(d.fin) - new Date(d.debut) > 3 * 86400e3) {
    l.push({ titre: t('conseil.etalee.titre', { duree: duree(d.debut, d.fin) }), texte: t('conseil.etalee.texte') });
  }
  return l;
}
function blocConseils(liste) {
  if (!liste.length) return null;
  return h('div', { class: 'carte bloc' }, h('h2', {}, t('conseils.titre')),
    h('p', { class: 'aide' }, t('conseils.aide')),
    h('ul', { class: 'conseils' }, liste.map((c) => h('li', {},
      h('div', { class: 'conseil-titre' }, c.titre), h('div', {}, c.texte),
      c.action ? h('button', { class: 'lien', onclick: c.action[1] }, c.action[0]) : null))));
}

// ------------------------------------------------------------------ overview
async function afficherVue() {
  const page = $('#page-vue');
  const v = await api('/api/vue').catch(() => null);
  if (!v) return;
  const convs = etat.conversations;
  const aujourdHui = new Date();
  const cle = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const jours = [];
  for (let i = 29; i >= 0; i--) { const d = new Date(aujourdHui); d.setDate(d.getDate() - i); jours.push({ x: cle(d), d, y: v.jours[cle(d)] || 0 }); }
  const sur = (n) => jours.slice(-n).reduce((a, j) => a + j.y, 0);
  const lourdes = convs.filter((c) => c.ctxMax >= 150000);
  const totalTout = convs.reduce((a, c) => a + total(c.tot) + total(c.agents.tot), 0);
  const tReparti = convs.reduce((a, c) => { for (const k of ['in', 'out', 'read', 'create']) a[k] += (c.tot[k] || 0) + (c.agents.tot[k] || 0); return a; }, { in: 0, out: 0, read: 0, create: 0 });

  page.replaceChildren(
    h('div', { class: 'entete' }, h('div', {}, h('h1', {}, t('nav.vue')),
      h('p', {}, t('vue.intro')))),
    h('div', { class: 'tuiles' },
      tuile(t('vue.aujourdhui'), fmt(sur(1)), t('vue.tokensTraites'), true),
      tuile(t('vue.7jours'), fmt(sur(7)), t('vue.tokensTraites')),
      tuile(t('vue.30jours'), fmt(sur(30)), t('vue.tokensTraites')),
      tuile(t('nav.conversations'), nf.format(convs.length), t('vue.auTotal', { n: fmt(totalTout) })),
      tuile(t('vue.lourdes'), nf.format(lourdes.length), t('vue.lourdesNote'))),
    h('div', { class: 'carte bloc' }, h('h2', {}, t('vue.parJour')),
      h('p', { class: 'aide' }, t('vue.parJourAide')),
      grapheBarres(jours, {
        libelle: (d) => d.d.toLocaleDateString(LOC, { day: '2-digit', month: '2-digit' }),
        info: (d) => [h('b', {}, fmt(d.y)), ` ${t('commun.tokens')}`, h('br'), h('span', { class: 'muet' }, d.d.toLocaleDateString(LOC, { weekday: 'long', day: 'numeric', month: 'long' }))],
      })),
    h('div', { class: 'carte bloc' }, h('h2', {}, t('vue.provenance')),
      h('p', { class: 'aide' }, t('vue.provenanceAide')),
      repartition(tReparti)),
    h('div', { class: 'grille-2' },
      h('div', { class: 'carte' }, h('h2', {}, t('vue.parProjet')), h('p', { class: 'aide' }, t('vue.parProjetAide')),
        h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, t('commun.projet')), h('th', { class: 'num' }, t('vue.colConv')), h('th', { class: 'num' }, t('vue.colTokens')), h('th', { class: 'num' }, t('vue.colRelus')))),
          h('tbody', {}, v.projets.slice(0, 15).map((p) => h('tr', { class: 'cliquable', title: p.cwd, onclick: () => { $('#filtre-projet').value = p.nom; allerA('conversations'); } },
            h('td', {}, p.nom), h('td', { class: 'num' }, p.conversations), h('td', { class: 'num' }, fmt(total(p.tot))), h('td', { class: 'num' }, pc(pct(p.tot.read, total(p.tot))))))))),
      h('div', { class: 'carte' }, h('h2', {}, t('vue.gourmandes')), h('p', { class: 'aide' }, t('vue.gourmandesAide')),
        h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, t('vue.colConversation')), h('th', { class: 'num' }, t('vue.colTokens')), h('th', { class: 'num' }, t('vue.colContexteMax')))),
          h('tbody', {}, [...convs].sort((a, b) => total(b.tot) + total(b.agents.tot) - total(a.tot) - total(a.agents.tot)).slice(0, 12).map((c) => h('tr', { class: 'cliquable', onclick: () => ouvrir(c.id) },
            h('td', {}, h('div', {}, c.titre.slice(0, 70)), h('div', { class: 'muet petit' }, `${c.projet} · ${date(c.fin)}`)),
            h('td', { class: 'num' }, fmt(total(c.tot) + total(c.agents.tot))), h('td', { class: 'num' }, fmt(c.ctxMax)))))))),
    blocConseils(conseilsGlobaux(convs, tReparti)),
  );
}
function tuile(libelle, valeur, note, forte = false) {
  return h('div', { class: `tuile${forte ? ' forte' : ''}` }, h('div', { class: 'libelle' }, libelle), h('div', { class: 'valeur' }, valeur), note && h('div', { class: 'note' }, note));
}

// ------------------------------------------------------------------ conversations
function remplirProjets() {
  const sel = $('#filtre-projet'); const v = sel.value;
  const projets = [...new Set(etat.conversations.map((c) => c.projet))].sort((a, b) => a.localeCompare(b));
  sel.replaceChildren(h('option', { value: '' }, t('conv.tousProjets')), ...projets.map((p) => h('option', { value: p }, p)));
  sel.value = projets.includes(v) ? v : '';
}
function afficherListe() {
  const q = $('#recherche').value.trim().toLowerCase();
  const projet = $('#filtre-projet').value;
  const tri = $('#tri').value;
  let l = etat.conversations.filter((c) => (!projet || c.projet === projet) && (!q || `${c.titre} ${c.projet} ${c.cwd}`.toLowerCase().includes(q)));
  if (tri === 'tokens') l = [...l].sort((a, b) => total(b.tot) + total(b.agents.tot) - total(a.tot) - total(a.agents.tot));
  if (tri === 'contexte') l = [...l].sort((a, b) => b.ctxMax - a.ctxMax);
  $('#liste-conv').replaceChildren(...l.slice(0, 400).map((c) => h('li', { class: etat.ouverts.includes(c.id) ? 'ouvert' : '', onclick: () => ouvrir(c.id), title: c.titre },
    h('div', { class: 't' }, c.titre), h('div', { class: 'n' }, fmt(total(c.tot) + total(c.agents.tot))),
    h('div', { class: 's' }, `${c.projet} · ${date(c.fin)}`), h('div', { class: 'c' }, `ctx ${fmt(c.ctxMax)}`))));
  if (!l.length) $('#liste-conv').append(h('li', { class: 'muet' }, etat.conversations.length ? t('conv.aucunResultat') : t('conv.lectureEnCours')));
}
['#recherche', '#filtre-projet', '#tri'].forEach((s2) => $(s2).addEventListener('input', afficherListe));

function sauverOnglets() { localStorage.setItem('relais-onglets', JSON.stringify(etat.ouverts)); localStorage.setItem('relais-actif', etat.actif || ''); }
function ouvrir(id) {
  if (!etat.ouverts.includes(id)) etat.ouverts.push(id);
  etat.actif = id; sauverOnglets();
  if (etat.page !== 'conversations') allerA('conversations'); else { afficherListe(); afficherOnglets(); afficherDetail(); }
}
function fermer(id) {
  const i = etat.ouverts.indexOf(id);
  etat.ouverts.splice(i, 1); etat.details.delete(id);
  if (etat.actif === id) etat.actif = etat.ouverts[Math.max(0, i - 1)] || null;
  sauverOnglets(); afficherListe(); afficherOnglets(); afficherDetail();
}
function afficherOnglets() {
  const parId = new Map(etat.conversations.map((c) => [c.id, c]));
  etat.ouverts = etat.ouverts.filter((id) => parId.has(id) || !etat.conversations.length);
  $('#onglets').replaceChildren(...etat.ouverts.map((id) => {
    const c = parId.get(id);
    return h('div', { class: `onglet${id === etat.actif ? ' actif' : ''}`, role: 'tab', 'aria-selected': String(id === etat.actif), title: c?.titre || id, onclick: () => { etat.actif = id; sauverOnglets(); afficherOnglets(); afficherDetail(); } },
      h('span', {}, c ? c.titre.slice(0, 40) : '…'),
      h('button', { class: 'fermer', 'aria-label': t('conv.fermerOnglet'), onclick: (ev) => { ev.stopPropagation(); fermer(id); } }, '×'));
  }));
}

async function afficherDetail(forcer = false) {
  const zone = $('#detail');
  const id = etat.actif;
  if (!id) { zone.replaceChildren(h('p', { class: 'vide' }, t('conv.choisir'))); return; }
  let d = etat.details.get(id);
  if (!d || forcer) {
    if (!d) zone.replaceChildren(h('p', { class: 'vide' }, t('commun.chargement')));
    d = await api(`/api/conversation?id=${encodeURIComponent(id)}`).catch(() => null);
    if (!d) { zone.replaceChildren(h('p', { class: 'vide' }, t('conv.introuvable'))); return; }
    d.titre = libre(d.titre);
    etat.details.set(id, d);
  }
  if (etat.actif !== id) return;
  const defilement = zone.scrollTop;
  const tA = d.totAgents; const tTout = total(d.tot) + total(tA);
  const tReparti = {}; for (const k of ['in', 'out', 'read', 'create']) tReparti[k] = (d.tot[k] || 0) + (tA[k] || 0);
  const moy = d.tot.appels ? total(d.tot) / d.tot.appels : 0;
  const outilsTop = d.outils.slice(0, 14);

  zone.replaceChildren(
    h('div', { class: 'entete' }, h('div', {},
      h('h1', { class: 'titre-conv', title: d.titre }, d.titre),
      h('p', {}, `${t('detail.periode', { projet: d.projet, debut: date(d.debut), fin: date(d.fin) })}${duree(d.debut, d.fin) ? ` (${duree(d.debut, d.fin)})` : ''}`),
      h('p', { class: 'muet petit' }, d.cwd))),
    h('div', { class: 'tuiles' },
      tuile(t('detail.tokensTraites'), fmt(tTout), d.agents.length ? t('detail.dontAgents', { tokens: fmt(total(tA)), n: d.agents.length }) : t('detail.toute'), true),
      tuile(t('detail.relus'), pc(pct(tReparti.read, tTout)), t('detail.relusCache', { n: fmt(tReparti.read) })),
      tuile(t('detail.generes'), fmt(tReparti.out), t('detail.generesNote')),
      tuile(t('detail.appels'), nf.format(d.tot.appels), t('detail.parAppel', { n: fmt(moy) })),
      tuile(t('detail.contexteMax'), fmt(d.ctxMax), t('detail.actuel', { n: fmt(d.ctxFin) })),
      tuile(t('detail.messages'), nf.format(d.tours.filter((x) => x.texte !== DEBUT).length + d.toursCaches), t('detail.envoyes'))),
    h('div', { class: 'carte bloc' }, h('h2', {}, t('detail.repartition')), repartition(tReparti)),
    h('div', { class: 'carte bloc' }, h('h2', {}, t('detail.courbe')),
      h('p', { class: 'aide' }, t('detail.courbeAide')),
      grapheCourbe(d.courbe, { pas: d.pasCourbe, seuils: [{ v: 150000, nom: t('detail.seuil150') }, { v: 250000, nom: t('detail.seuil250') }] })),
    h('div', { class: 'grille-2' },
      h('div', { class: 'carte' }, h('h2', {}, t('detail.outils')),
        h('p', { class: 'aide' }, t('detail.outilsAide')),
        outilsTop.length ? barresH(outilsTop, {
          valeur: (l) => l.tokens, texte: (l) => `${fmt(l.tokens)} · ${nf.format(l.appels)}×`,
          info: (l) => [h('b', {}, l.nom), h('br'), t('detail.outilInfo', { nb: nf.format(l.appels), n: l.appels, tokens: fmt(l.tokens) }), h('br'), h('span', { class: 'muet' }, t('detail.outilMoyenne', { n: fmt(l.appels ? l.tokens / l.appels : 0) }))],
        }) : h('p', { class: 'muet' }, t('detail.aucunOutil'))),
      h('div', { class: 'carte' }, h('h2', {}, t('detail.agents')),
        h('p', { class: 'aide' }, t('detail.agentsAide')),
        d.agents.length ? h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, t('detail.colAgent')), h('th', { class: 'num' }, t('detail.colAppels')), h('th', { class: 'num' }, t('detail.colTokens')))),
          h('tbody', {}, d.agents.map((a) => h('tr', {},
            h('td', {}, h('div', {}, h('b', {}, a.type), a.description ? ` · ${a.description}` : ''), h('div', { class: 'puces' }, a.outils.map((o) => h('span', { class: 'puce' }, `${o.nom} ${o.appels}`)))),
            h('td', { class: 'num' }, nf.format(a.tot.appels)), h('td', { class: 'num' }, fmt(total(a.tot)))))))
          : h('p', { class: 'muet' }, t('detail.aucunAgent')),
        h('h2', { style: { 'margin-top': '18px' } }, t('detail.modeles')),
        h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, t('detail.colModele')), h('th', { class: 'num' }, t('detail.colAppels')), h('th', { class: 'num' }, t('detail.colTokens')))),
          h('tbody', {}, Object.entries(d.modeles).sort((a, b) => total(b[1]) - total(a[1])).map(([m, x]) => h('tr', {}, h('td', {}, m), h('td', { class: 'num' }, nf.format(x.appels)), h('td', { class: 'num' }, fmt(total(x))))))))),
    tableTours(d),
    blocConseils(conseilsConversation(d, tReparti)),
  );
  zone.scrollTop = defilement;
}

function tableTours(d) {
  const carte = h('div', { class: 'carte bloc' });
  let tri = 'date'; let limite = 200;
  let ouvert = null; // { n, filtre }: the turn whose calls are shown under its row
  const tours = d.tours.filter((x) => x.texte !== DEBUT || x.appels);
  const rendre = () => {
    const l = tri === 'date' ? [...tours].reverse() : [...tours].sort((a, b) => total(b) - total(a));
    const th = (cle, texte, num = true) => h('th', { class: `triable${num ? ' num' : ''}`, onclick: () => { tri = cle; rendre(); } }, `${texte}${tri === cle ? ' ▾' : ''}`);
    carte.replaceChildren(
      h('h2', {}, t('tours.titre')),
      h('p', { class: 'aide' }, t('tours.aide')
        + (d.toursCaches ? ` ${t('tours.caches', { nb: nf.format(d.toursCaches), n: d.toursCaches })}` : '')),
      h('div', { class: 'defile' }, h('table', {},
        h('thead', {}, h('tr', {}, th('date', t('tours.colQuand'), false), h('th', {}, t('tours.colMessage')), h('th', { class: 'num' }, t('detail.colAppels')), th('tokens', t('detail.colTokens')), h('th', { class: 'num' }, t('tours.colGeneres')), h('th', { class: 'num' }, t('tours.colContexte')), h('th', {}, t('tours.colOutils')))),
        h('tbody', {}, l.slice(0, limite).flatMap((tour) => [h('tr', { class: ouvert?.n === tour.n ? 'ouvert' : '' },
          h('td', { class: 'chiffre muet' }, heure(tour.t)),
          h('td', { class: 'message' }, libre(tour.texte), !tour.appels ? h('div', {}, h('span', { class: 'badge neutre' }, t('tours.sansReponse'))) : null,
            total(tour) >= 2e6 ? h('div', {}, h('span', { class: 'badge grave' }, t('tours.gourmand'))) : null),
          h('td', { class: 'num' }, tour.appels || ''),
          h('td', { class: 'num' }, tour.appels ? fmt(total(tour)) : ''),
          h('td', { class: 'num' }, tour.appels ? fmt(tour.out) : ''),
          h('td', { class: 'num' }, tour.ctx ? fmt(tour.ctx) : ''),
          h('td', { class: 'outils' }, h('div', { class: 'puces' }, Object.entries(tour.outils).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([n, k]) => h('button', {
            class: `puce cliquable${ouvert?.n === tour.n && ouvert.filtre === n ? ' actif' : ''}`, title: t('tours.voirAppels'),
            onclick: () => { ouvert = ouvert?.n === tour.n && ouvert.filtre === n ? null : { n: tour.n, filtre: n }; rendre(); },
          }, `${n} ${k}`))),
            tour.appels ? h('button', { class: 'lien petit', onclick: () => { ouvert = ouvert?.n === tour.n && !ouvert.filtre ? null : { n: tour.n, filtre: '' }; rendre(); } },
              ouvert?.n === tour.n ? t('commun.fermer') : t('tours.detail')) : null)),
          ouvert?.n === tour.n ? h('tr', { class: 'detail-tour' }, h('td', { colspan: 7 }, detailMessage(d.id, tour, ouvert, (f) => { ouvert = { n: tour.n, filtre: f }; rendre(); }))) : null])))),
      l.length > limite ? h('button', { class: 'bouton plus', onclick: () => { limite += 300; rendre(); } }, t('tours.plus', { nb: nf.format(l.length - limite), n: l.length - limite })) : null,
    );
  };
  rendre();
  return carte;
}

// Every model call of one message, the tools each one ran and their result size. `ouvert.filtre` = one tool.
const cacheTours = new Map();
function detailMessage(id, tour, ouvert, choisir) {
  const zone = h('div', { class: 'detail-appels' }, h('p', { class: 'muet petit' }, t('appels.lecture')));
  const cle = `${id}#${tour.n}`;
  const charge = cacheTours.get(cle) || api(`/api/conversation/tour?id=${encodeURIComponent(id)}&n=${tour.n}`);
  cacheTours.set(cle, charge);
  charge.then((r) => {
    const tousOutils = [...new Set(r.appels.flatMap((a) => a.outils.map((o) => o.nom)))];
    const garde = (o) => !ouvert.filtre || o.nom === ouvert.filtre;
    const choisis = r.appels.flatMap((a) => a.outils.filter(garde));
    const totalAppel = (a) => a.in + a.read + a.create + a.out;
    const appels = r.appels.map((a, i) => ({ ...a, num: i + 1 })).filter((a) => !ouvert.filtre || a.outils.some(garde));
    const nbAppels = { nb: nf.format(r.appels.length), n: r.appels.length };
    const th = (cle2, aide, num = true) => h('th', { class: num ? 'num' : null, title: aide ? t(aide) : null }, t(cle2));
    zone.replaceChildren(
      h('div', { class: 'puces' },
        h('button', { class: `puce cliquable${!ouvert.filtre ? ' actif' : ''}`, onclick: () => choisir('') }, t('appels.tout', nbAppels)),
        tousOutils.map((n) => h('button', { class: `puce cliquable${ouvert.filtre === n ? ' actif' : ''}`, onclick: () => choisir(n) }, n))),
      h('p', { class: 'aide' }, ouvert.filtre
        ? t('appels.aideOutil', { outil: ouvert.filtre, nb: nf.format(choisis.length), n: choisis.length, tokens: fmt(choisis.reduce((s, o) => s + o.tokens, 0)) })
        : t('appels.aideTout', { ...nbAppels, k: choisis.length })),
      h('table', { class: 'appels' },
        h('thead', {}, h('tr', {}, h('th', {}, '#'), th('appels.colHeure', null, false), th('appels.colQuoi', null, false), th('appels.colResultat', 'appels.colResultatAide'),
          th('appels.colLu', 'appels.colLuAide'), th('appels.colEcrit', 'appels.colEcritAide'),
          th('appels.colEntree', 'appels.colEntreeAide'), th('appels.colGeneres'), th('appels.colTotal'))),
        h('tbody', {}, appels.flatMap((a) => {
          const lignes = a.outils.filter(garde);
          const premiere = (contenu) => [
            h('td', { class: 'num muet', rowspan: Math.max(1, lignes.length) }, a.num),
            h('td', { class: 'chiffre muet', rowspan: Math.max(1, lignes.length) }, heure(a.t)),
            ...contenu,
            ...[a.read, a.create, a.in, a.out, totalAppel(a)].map((v, k) => h('td', { class: `num${k === 4 ? ' fort' : ''}`, rowspan: Math.max(1, lignes.length) }, fmt(v))),
          ];
          if (!lignes.length) return h('tr', {}, premiere([h('td', { class: 'muet' }, t('appels.texteSeul')), h('td', {}, '')]));
          return lignes.map((o, k) => {
            const cellules = [h('td', { class: 'quoi' }, h('b', {}, o.nom), o.erreur ? h('span', { class: 'badge alerte' }, t('appels.erreur')) : null, h('div', { class: 'muet petit' }, o.quoi)),
              h('td', { class: 'num' }, o.tokens ? `≈ ${fmt(o.tokens)}` : '')];
            return h('tr', {}, k === 0 ? premiere(cellules) : cellules);
          });
        }))));
  }).catch((e) => { cacheTours.delete(cle); zone.replaceChildren(h('p', { class: 'attention' }, e.message)); });
  return zone;
}

// ------------------------------------------------------------------ skills
const installations = new Map(); // plugin name -> 'install' | 'maj': the "relaunch Claude Code" message stays until closed
const CLE_DEMARRER = 'relais.demarrer.replie';
const URL_NODE = 'https://nodejs.org/'; // the app refuses external navigation: shown as copyable text
const ligneCopiable = (texte) => h('div', { class: 'cmd' }, h('code', {}, texte),
  h('button', { class: 'bouton', onclick: () => navigator.clipboard.writeText(texte).then(() => toast(t('commun.copie'))) }, t('commun.copier')));
const detailNode = (n) => (n.etat === 'absent' ? t('node.absent') : t('node.ancien', { version: n.version }));
async function reverifierNode(ev) {
  ev.currentTarget.disabled = true;
  const n = await api('/api/node?forcer=1').catch(() => null);
  if (n?.etat === 'ok') toast(t('node.detecte', { version: n.version })); else toast(t('node.toujours'), true);
  await afficherSkills();
}
const bandeauNode = (n) => h('div', { class: 'avertissement fort', role: 'alert' },
  h('p', {}, h('b', {}, t('node.titre'))), h('p', {}, detailNode(n)), h('p', {}, t('node.installer')), ligneCopiable(URL_NODE),
  h('div', { class: 'actions', style: { 'margin-top': '8px' } }, h('button', { class: 'bouton', onclick: reverifierNode }, t('node.reverifier'))));

// "Getting started": the real state of each point (green = fine, red = blocks the plugins, orange = to do).
function encadreDemarrer({ cpt, node, liste }) {
  const nodeOk = node?.etat === 'ok';
  const doubles = liste.filter((p) => p.doublons?.length);
  const etatPlugin = (p) => t(p.doublons?.length ? 'demarrer.deuxFois' : p.etat === 'absent' ? 'demarrer.nonInstalle' : 'demarrer.installe');
  const points = [
    { s: cpt?.connecte ? 'bon' : 'rouge', titre: t('demarrer.claude'), detail: cpt?.connecte ? t('demarrer.claudeCompte', { nom: cpt.nom || cpt.email || t('compte.defaut') }) : (cpt?.raison || '') },
    { s: nodeOk ? 'bon' : node ? 'rouge' : 'orange', titre: t('demarrer.node'), detail: nodeOk ? t('demarrer.nodeOk', { version: node.version }) : node ? detailNode(node) : '',
      plus: null }, // the red Node banner below gives the fix
    { s: doubles.length ? 'rouge' : liste.some((p) => p.etat === 'absent') ? 'orange' : 'bon', titre: t('demarrer.plugins'), detail: liste.map((p) => `${p.nom} : ${etatPlugin(p)}`).join(' \u00b7 ') },
  ];
  const rouge = points.some((x) => x.s === 'rouge');
  let replie = false;
  try { replie = localStorage.getItem(CLE_DEMARRER) === '1'; } catch { /* storage refused */ }
  const d = h('details', { class: 'carte demarrer', open: rouge || !replie },
    h('summary', {}, t('demarrer.titre')),
    h('ul', {}, points.map((x) => h('li', {}, h('span', { class: `pt ${x.s}`, 'aria-hidden': 'true' }, { bon: '\u2713', rouge: '\u2717', orange: '!' }[x.s]),
      h('div', {}, h('b', {}, x.titre), x.detail ? h('p', {}, x.detail) : null, x.plus)))),
    h('div', { class: 'notes' }, h('p', {}, t('demarrer.rappel')), h('p', {}, t('demarrer.ensuite')), bureau ? h('p', { class: 'muet petit' }, t('demarrer.signature')) : null));
  d.addEventListener('toggle', () => { if (!rouge) try { localStorage.setItem(CLE_DEMARRER, d.open ? '0' : '1'); } catch { /* storage refused */ } });
  return d;
}

async function afficherSkills() {
  const page = $('#page-skills');
  const [liste, node, cpt] = await Promise.all([api('/api/skills').catch(() => []), api('/api/node').catch(() => null), api('/api/compte').catch(() => null)]);
  const nodeMauvais = !!node && node.etat !== 'ok';
  const BADGES = {
    'a-jour': ['bon', t('skills.badgeAJour')], ancienne: ['alerte', t('skills.badgeAncienne')], absent: ['neutre', t('skills.badgeAbsent')], marketplace: ['bon', t('skills.badgeMarketplace')],
  };
  page.replaceChildren(
    h('div', { class: 'entete' }, h('div', {}, h('h1', {}, t('skills.titre')),
      h('p', {}, t('skills.intro')))),
    encadreDemarrer({ cpt, node, liste }),
    ...(nodeMauvais ? [bandeauNode(node)] : []), // replaceChildren would print "null"
    h('div', { class: 'skills' }, liste.map((p) => {
      const [cls, txt] = BADGES[p.etat] || BADGES.absent;
      return h('div', { class: 'carte skill' },
        h('h2', {}, p.nom, h('span', { class: 'version' }, `v${p.versionDispo}`), h('span', { class: `badge ${cls}` }, txt)),
        installations.has(p.nom) ? h('div', { class: 'avertissement succes', role: 'status' },
          h('p', {}, h('b', {}, t(installations.get(p.nom) === 'maj' ? 'skills.apresMaj' : 'skills.apresInstall'))),
          p.nom === 'avocat' ? h('p', {}, t('skills.apresAvocat')) : p.nom === 'images' ? h('p', {}, t('skills.apresImages')) : null,
          h('div', { class: 'actions' }, h('button', { class: 'bouton', onclick: () => { installations.delete(p.nom); afficherSkills(); } }, t('commun.fermer')))) : null,
        p.doublons?.length ? h('div', { class: 'avertissement fort', role: 'alert' }, h('p', {}, h('b', {}, t('skills.doublon'))),
          h('p', {}, t('skills.doublonRetirer')), p.doublons.map((x) => ligneCopiable(x.commande))) : null,
        h('p', {}, p.description),
        p.nom === 'images' ? h('p', { class: 'muet petit' }, t('skills.prerequisImages')) : null,
        h('dl', {},
          p.skills.length ? [h('dt', {}, t('skills.commandes')), h('dd', {}, h('div', { class: 'puces' }, p.skills.map((x) => h('span', { class: 'puce', title: x.description }, `/${x.nom}`))))] : null,
          p.agents.length ? [h('dt', {}, t('skills.agents')), h('dd', {}, h('div', { class: 'puces' }, p.agents.map((x) => h('span', { class: 'puce', title: x.description }, x.nom))))] : null,
          p.hooks.length ? [h('dt', {}, t('skills.automatique')), h('dd', {}, p.hooks.map(nomHook).join(', '))] : null,
          p.versionInstallee ? [h('dt', {}, t('skills.installe')), h('dd', {}, `v${p.versionInstallee}`)] : null),
        nodeMauvais ? h('div', { class: 'attention', style: { 'margin-bottom': '10px' } }, t('skills.nodeCourt')) : null,
        h('div', { class: 'actions' },
          p.etat === 'marketplace' ? h('span', { class: 'muet petit' }, t('skills.parPlugin'))
            : h('button', { class: `bouton${p.etat === 'a-jour' ? '' : ' principal'}`, onclick: (ev) => installerPlugin(p, ev.currentTarget) },
              p.etat === 'absent' ? t('commun.installer') : p.etat === 'ancienne' ? t('skills.mettreAJour') : t('skills.reinstaller'))),
        h('details', {}, h('summary', {}, t('skills.autreMethode')),
          h('p', { class: 'muet' }, t('skills.autreMethodeAide')),
          p.commandes.map((c) => h('div', { class: 'cmd' }, h('code', {}, c), h('button', { class: 'bouton', onclick: () => navigator.clipboard.writeText(c).then(() => toast(t('commun.commandeCopiee'))) }, t('commun.copier'))))));
    })),
    h('p', { class: 'aide', style: { 'margin-top': '18px' } }, t('skills.ajouter')),
    await sectionExternes(),
  );
}

// Other people's skills and tools (GitHub), by category. Display only: install = commands to copy.
const etoilesCourt = new Intl.NumberFormat(LOC, { notation: 'compact', maximumFractionDigits: 1 });
const boutonCopier = (texte) => h('button', { class: 'bouton', onclick: () => navigator.clipboard.writeText(texte).then(() => toast(t('commun.copie'))) }, t('commun.copier'));
// Demo video in a modal dialog: closes with the button, Escape or a click outside; Tab stays inside; focus goes back.
function ouvrirDemo(s) {
  const retour = document.activeElement;
  const fermer = h('button', { class: 'bouton', type: 'button' }, t('commun.fermer'));
  const video = h('video', { controls: true, preload: 'metadata', playsinline: true, src: s.demo.video }, t('externes.demoIndispo'));
  const fond = h('div', { class: 'demo-fond' });
  const boite = h('div', { class: 'demo-boite', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('externes.demoTitre', { nom: s.nom }) },
    h('div', { class: 'demo-entete' }, h('h2', {}, t('externes.demoTitre', { nom: s.nom })), fermer),
    video, s.demo.legende ? h('p', { class: 'muet petit' }, s.demo.legende) : null);
  fond.append(boite);
  const clavier = (ev) => {
    if (ev.key === 'Escape') { ev.preventDefault(); clore(); return; }
    if (ev.key !== 'Tab') return;
    const cibles = [video, fermer];
    const i = cibles.indexOf(document.activeElement);
    ev.preventDefault();
    cibles[(i + (ev.shiftKey ? cibles.length - 1 : 1)) % cibles.length].focus();
  };
  function clore() {
    document.removeEventListener('keydown', clavier, true);
    video.pause(); fond.remove();
    if (retour?.isConnected) retour.focus();
  }
  fermer.addEventListener('click', clore);
  fond.addEventListener('click', (ev) => { if (ev.target === fond) clore(); });
  document.addEventListener('keydown', clavier, true);
  document.body.append(fond);
  fermer.focus();
}
async function sectionExternes() {
  const d = await api('/api/skills/externes').catch(() => null);
  if (!d?.skills?.length) return null;
  d.projets = await api('/api/gestion/projets').catch(() => []);
  const releve = new Date(`${d.releve}T12:00:00`).toLocaleDateString(LOC, { day: 'numeric', month: 'long', year: 'numeric' });
  // Same template for every card (see the top of tableau/skills-externes.mjs).
  const carte = (s) => h('div', { class: 'carte skill externe' },
    h('h2', {}, s.nom, h('span', { class: 'badge neutre', title: t('externes.etoiles', { nb: nf.format(s.etoiles), date: releve }) }, `★ ${etoilesCourt.format(s.etoiles)}`)),
    h('div', { class: 'puces' }, h('span', { class: 'puce' }, s.type), h('span', { class: 'puce' }, t('externes.licence', { licence: s.licence }))),
    h('p', { class: 'resume' }, s.resume),
    h('h3', {}, t('commun.commentCaMarche')),
    h('ol', { class: 'schema' }, s.schema.map((etape) => h('li', {}, etape))),
    h('h3', {}, t('externes.ceQueCaFait')),
    s.description.map((x) => h('p', { class: 'description' }, x)),
    h('details', {}, h('summary', {}, t('externes.contenu')),
      h('dl', {}, s.contenu.flatMap(([n, x]) => [h('dt', {}, n), h('dd', {}, x)]))),
    h('h3', {}, t('externes.cout')),
    h('p', { class: `cout${s.cout.jetons > 10000 ? ' cher' : ''}` },
      s.cout.jetons != null ? h('b', {}, t('externes.coutParConversation', { n: nf.format(s.cout.jetons) })) : null, s.cout.jetons != null ? ' · ' : null, s.cout.note),
    h('h3', {}, t('commun.installer')),
    actionExterne(s, d),
    h('details', {}, h('summary', {}, t('externes.aLaMain')),
      s.installation.flatMap(([etiquette, c]) => [h('div', { class: 'muet petit' }, etiquette), h('div', { class: 'cmd' }, h('code', {}, c), boutonCopier(c))])),
    h('h3', {}, t('externes.utiliser')),
    h('ul', {}, s.utilisation.map((x) => h('li', {}, x))),
    s.prompt ? [h('h3', {}, t('externes.prompt')), h('div', { class: 'cmd prompt' }, h('code', {}, s.prompt.texte), boutonCopier(s.prompt.texte)),
      s.prompt.conseil ? h('p', { class: 'muet petit' }, s.prompt.conseil) : null] : null,
    s.demo ? h('p', {}, h('button', { class: 'bouton', type: 'button', onclick: () => ouvrirDemo(s) }, t('externes.demo'))) : null,
    s.attention ? h('p', { class: 'attention' }, s.attention) : null,
    h('div', { class: 'cmd' }, h('code', {}, s.url), boutonCopier(s.url)));
  return h('div', { class: 'externes' },
    h('div', { class: 'entete' }, h('div', {}, h('h1', {}, t('externes.titre')),
      h('p', {}, t('externes.intro', { date: releve })))),
    d.categories.map((c) => {
      const liste = d.skills.filter((s) => s.categorie === c.id);
      return liste.length ? h('section', { class: 'categorie' }, h('h2', {}, c.nom, h('span', { class: 'version' }, `${liste.length}`)), h('p', { class: 'muet' }, c.description),
        h('div', { class: 'skills' }, liste.map(carte))) : null;
    }));
}
// Install button of an external card. Nothing runs before the click + confirmation.
const EXPLICATIONS = {
  plugin: (s) => t('externes.confirmerPlugin', { marketplace: s.action.marketplace, plugin: s.action.plugin }),
  npm: (s) => t('externes.confirmerNpm', { paquet: s.action.paquet }),
  uv: (s) => t('externes.confirmerUv', { paquet: s.action.paquet }),
};
function actionExterne(s, d) {
  const a = s.action;
  if (!a) return null;
  if (a.type === 'design-md') {
    const style = h('select', {}, d.stylesDesign.map((x) => h('option', { value: x, selected: x === 'vercel' }, x)));
    const projet = choixProjet(d.projets);
    const bouton = h('button', { class: 'bouton principal', onclick: async () => {
      const corps = { style: style.value, projet: projet.valeur() };
      bouton.disabled = true;
      try { toast((await api('/api/externes/design', corps)).message); } catch (e) {
        if (!e.donnees?.existe) toast(e.message, true);
        else if (confirm(`${e.message}\n${t('externes.remplacer', { style: corps.style })}`)) {
          try { toast((await api('/api/externes/design', { ...corps, ecraser: true })).message); } catch (e2) { toast(e2.message, true); }
        }
      }
      bouton.disabled = false;
    } }, t('externes.ajouterProjet'));
    return h('div', { class: 'formulaire' }, h('label', {}, t('externes.style'), style), h('label', {}, t('commun.projet'), projet.el), bouton);
  }
  if (a.type === 'skills') { // copied into ONE project, never everywhere
    const projet = choixProjet(d.projets);
    const bouton = h('button', { class: 'bouton principal', onclick: async () => {
      const dossier = projet.valeur();
      if (!dossier || !confirm(t('externes.confirmerSkills', { depot: a.depot, skills: a.skills.join(', '), projet: dossier }))) return;
      const avant = bouton.textContent;
      bouton.disabled = true; bouton.textContent = t('externes.installation');
      try { toast((await api('/api/externes/skills', { id: s.id, projet: dossier })).message); } catch (e) { toast(e.message, true); }
      bouton.disabled = false; bouton.textContent = avant;
    } }, t('externes.ajouterProjet'));
    return h('div', { class: 'formulaire' }, h('label', {}, t('commun.projet'), projet.el), bouton);
  }
  const bouton = h('button', { class: 'bouton principal', onclick: async () => {
    if (!confirm(EXPLICATIONS[a.type](s))) return;
    const avant = bouton.textContent;
    bouton.disabled = true; bouton.textContent = t('externes.installation');
    try { toast((await api('/api/externes/installer', { id: s.id })).message); } catch (e) { toast(e.message, true); }
    bouton.disabled = false; bouton.textContent = avant;
  } }, t('commun.installer'));
  return h('div', { class: 'actions' }, bouton);
}

// Project picker: known projects (from the conversations) or any folder typed by hand.
function choixProjet(projets, { partout = false, onchange } = {}) {
  const AUTRE = '__autre__';
  const saisie = h('input', { type: 'text', placeholder: t('projet.exemple'), hidden: true, onchange: () => onchange?.() });
  const liste = h('select', { onchange: () => { saisie.hidden = liste.value !== AUTRE; if (liste.value !== AUTRE) onchange?.(); } },
    partout ? h('option', { value: '' }, t('projet.partout')) : null,
    projets.map((p) => h('option', { value: p.dossier }, `${p.nom}  (${p.dossier})`)),
    h('option', { value: AUTRE }, t('projet.autre')));
  if (!partout && !projets.length) { liste.value = AUTRE; saisie.hidden = false; }
  return { el: h('span', { class: 'choix-projet' }, liste, saisie), valeur: () => (liste.value === AUTRE ? saisie.value.trim() : liste.value) };
}

// ------------------------------------------------------------------ skill management
const jetons = (n) => (n == null ? '?' : `~${nf.format(n)}`);
async function afficherGestion() {
  const page = $('#page-gestion');
  page.replaceChildren(h('div', { class: 'entete' }, h('div', {}, h('h1', {}, t('gestion.titre')), h('p', {}, t('gestion.lecturePlugins')))));
  const projets = await api('/api/gestion/projets').catch(() => []);
  const zone = h('div', {});
  const ou = choixProjet(projets, { partout: true, onchange: () => remplir() });
  async function remplir() {
    const projet = ou.valeur();
    zone.replaceChildren(h('p', { class: 'muet' }, t('gestion.lectureEtat')));
    let r;
    try { r = await api(`/api/gestion/plugins?projet=${encodeURIComponent(projet)}`); } catch (e) { zone.replaceChildren(h('p', { class: 'attention' }, e.message)); return; }
    const total = r.plugins.filter((p) => p.actif).reduce((s, p) => s + (p.cout || 0), 0);
    zone.replaceChildren(
      h('p', { class: 'muet' }, projet ? t('gestion.dansProjet', { projet: r.projet }) : t('gestion.partout')),
      h('table', { class: 'gestion' },
        h('thead', {}, h('tr', {}, h('th', {}, t('gestion.colActif')), h('th', {}, t('gestion.colPlugin')), h('th', {}, t('gestion.colSource')),
          h('th', { title: t('gestion.colCoutAide') }, t('gestion.colCout')))),
        h('tbody', {}, r.plugins.map((p) => h('tr', {},
          h('td', {}, h('input', { type: 'checkbox', checked: p.actif, 'aria-label': t('gestion.activerNom', { nom: p.nom }), onchange: async (ev) => {
            const c = ev.currentTarget; c.disabled = true;
            try { toast((await api('/api/gestion/activer', { id: p.id, actif: c.checked, portee: projet ? 'local' : 'user', projet })).message); }
            catch (e) { toast(e.message, true); }
            remplir();
          } })),
          h('td', {}, h('strong', {}, p.nom), p.version ? h('span', { class: 'muet petit' }, `  ${/^\d/.test(p.version) ? 'v' : ''}${p.version}`) : null,
            p.nom === 'avocat' ? h('div', { class: 'muet petit' }, `${t('gestion.modeAvocat')} `,
              h('button', { class: `lien petit${etat.avocat.actif ? '' : ' muet'}`, onclick: () => allerA('avocat') }, etat.avocat.actif ? t('commun.on') : t('gestion.avocatOff'))) : null),
          h('td', { class: 'muet' }, p.source),
          h('td', {}, t('gestion.jetons', { n: jetons(p.cout) })))))),
      h('p', { class: 'aide' }, t('gestion.total', { n: jetons(total) })));
  }
  page.replaceChildren(
    h('div', { class: 'entete' }, h('div', {}, h('h1', {}, t('gestion.titre')),
      h('p', {}, t('gestion.intro')))),
    h('div', { class: 'carte' }, h('h2', {}, t('gestion.activerDesactiver')), h('div', { class: 'formulaire' }, h('label', {}, t('gestion.ou'), ou.el)), zone),
    h('div', { class: 'carte' }, await sectionProfils(projets)));
  remplir();
}

async function sectionProfils(projets) {
  const [liste, inst] = await Promise.all([api('/api/gestion/profils').catch(() => []), api('/api/gestion/plugins').catch(() => ({ plugins: [] }))]);
  const conteneur = h('div', {});
  const rafraichir = async () => conteneur.replaceWith(await sectionProfils(projets));
  const editeur = (profil) => {
    const nom = h('input', { type: 'text', value: profil?.nom || '', placeholder: t('profils.exemple') });
    const coches = inst.plugins.map((p) => ({ p, c: h('input', { type: 'checkbox', checked: profil ? profil.plugins[p.id] === true : p.actif }) }));
    return h('div', { class: 'editeur' },
      h('label', {}, t('profils.nom'), nom),
      h('div', { class: 'muet petit' }, t('profils.pluginsActifs')),
      h('div', { class: 'coches' }, coches.map(({ p, c }) => h('label', {}, c, ` ${p.nom}`, h('span', { class: 'muet petit' }, ` ${jetons(p.cout)}`)))),
      h('div', {}, h('button', { class: 'bouton principal', onclick: async () => {
        const plugins = Object.fromEntries(coches.map(({ p, c }) => [p.id, c.checked]));
        try { toast((await api('/api/gestion/profil', { id: profil?.id, nom: nom.value, plugins })).message); rafraichir(); } catch (e) { toast(e.message, true); }
      } }, profil ? t('profils.enregistrer') : t('profils.creer'))));
  };
  conteneur.append(
    h('h2', {}, t('profils.titre')),
    h('p', { class: 'muet' }, t('profils.intro')),
    liste.length ? liste.map((pr) => {
      const projet = choixProjet(projets);
      const actifs = Object.entries(pr.plugins).filter(([, v]) => v).map(([id]) => id.split('@')[0]);
      const cout = inst.plugins.filter((p) => pr.plugins[p.id]).reduce((s, p) => s + (p.cout || 0), 0);
      const zoneEdition = h('div', {});
      return h('div', { class: 'profil' },
        h('h3', {}, pr.nom, h('span', { class: 'muet petit' }, `  ${t('profils.jetonsPermanents', { n: jetons(cout) })}`)),
        h('div', { class: 'puces' }, actifs.length ? actifs.map((n) => h('span', { class: 'puce' }, n)) : h('span', { class: 'muet petit' }, t('profils.aucunPlugin'))),
        h('div', { class: 'formulaire' }, h('label', {}, t('commun.projet'), projet.el),
          h('button', { class: 'bouton principal', onclick: async () => {
            try { toast((await api('/api/gestion/lancer', { id: pr.id, projet: projet.valeur() })).message); } catch (e) { toast(e.message, true); }
          } }, t('profils.lancer')),
          h('button', { class: 'bouton', onclick: () => zoneEdition.replaceChildren(editeur(pr)) }, t('profils.modifier')),
          h('button', { class: 'bouton', onclick: async () => {
            if (!confirm(t('profils.confirmerSuppression', { nom: pr.nom }))) return;
            try { toast((await api('/api/gestion/profil/supprimer', { id: pr.id })).message); rafraichir(); } catch (e) { toast(e.message, true); }
          } }, t('profils.supprimer'))),
        h('div', { class: 'cmd' }, h('code', {}, pr.commande), boutonCopier(pr.commande)),
        zoneEdition);
    }) : h('p', { class: 'muet petit' }, t('profils.aucun')),
    h('details', {}, h('summary', {}, t('profils.nouveau')), editeur(null)));
  return conteneur;
}

const HOOKS = ['UserPromptSubmit', 'SessionStart', 'SessionEnd', 'Stop', 'PreToolUse', 'PostToolUse'];
const nomHook = (k) => (HOOKS.includes(k) ? t(`hook.${k}`) : k);
async function installerPlugin(p, bouton) {
  bouton.disabled = true;
  try { await api('/api/skills/installer', { nom: p.nom }); installations.set(p.nom, p.etat === 'ancienne' ? 'maj' : 'install'); } catch (e) { toast(e.message, true); }
  await afficherSkills(); rafraichirEtat();
}

// ------------------------------------------------------------------ memory (what Claude recorded and loaded)
// Entries come from <claude dir>/relais/registre.json (tableau/memoire.mjs). Everything read from disk is
// inserted as text, never as HTML.
const memo = { entrees: [], projets: [], fichiers: [], portee: '*', type: '', aCorriger: false, q: '', edition: null };
let memoZones = null;
const TYPES_MEMOIRE = ['regle', 'piege', 'solution'];
const NOM_TYPE = { regle: 'memoire.type.regle', piege: 'memoire.type.piege', solution: 'memoire.type.solution' };
const BADGE_TYPE = { regle: 'neutre', piege: 'alerte', solution: 'bon' };
const NOM_ORIGINE = { claude: 'memoire.origine.claude', utilisateur: 'memoire.origine.utilisateur' };
const NOM_RAISON = {
  session_start: 'memoire.raison.session_start', nested_traversal: 'memoire.raison.nested_traversal',
  path_glob_match: 'memoire.raison.path_glob_match', include: 'memoire.raison.include', compact: 'memoire.raison.compact',
};
const nomDossier = (p) => String(p).replace(/[\\/]+$/, '').split(/[\\/]/).pop() || String(p);
const cleDossier = (p) => String(p).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
const porteeDe = (e) => (e.portee === 'global' ? 'global' : cleDossier(e.portee));

async function afficherMemoire() {
  const page = $('#page-memoire');
  const entete = h('div', { class: 'entete' }, h('div', {}, h('h1', {}, t('memoire.titre')), h('p', {}, t('memoire.intro'))),
    h('button', { class: 'bouton principal', onclick: () => ouvrirFormulaireMemoire() }, t('memoire.ajouter')));
  const d = await api('/api/memoire').catch(() => null);
  if (!d) { memoZones = null; page.replaceChildren(entete, h('p', { class: 'attention' }, t('memoire.erreurLecture'))); return; }
  Object.assign(memo, { entrees: d.entrees, projets: d.projets, fichiers: d.fichiers, edition: null });
  const zoneChips = h('div', { class: 'puces chips-memoire', role: 'group', 'aria-label': t('memoire.filtrePortee') });
  const type = h('select', { 'aria-label': t('memoire.filtreType'), onchange: (ev) => { memo.type = ev.currentTarget.value; dessinerMemoire(); } },
    h('option', { value: '' }, t('memoire.tousTypes')), TYPES_MEMOIRE.map((k) => h('option', { value: k, selected: memo.type === k }, t(NOM_TYPE[k]))));
  const corrige = h('input', { type: 'checkbox', checked: memo.aCorriger, onchange: (ev) => { memo.aCorriger = ev.currentTarget.checked; dessinerMemoire(); } });
  const recherche = h('input', { type: 'search', value: memo.q, placeholder: t('memoire.rechercher'), 'aria-label': t('memoire.rechercher'), autocomplete: 'off',
    oninput: (ev) => { memo.q = ev.currentTarget.value; dessinerMemoire(); } });
  const nombre = h('span', { class: 'muet petit' });
  memoZones = { zoneChips, nombre, zoneNouveau: h('div', {}), zoneListe: h('div', { class: 'memoire-liste' }), zoneFichiers: h('div', { class: 'carte bloc' }) };
  page.replaceChildren(entete, carteChat(),
    h('div', { class: 'carte filtres-memoire' },
      zoneChips,
      h('div', { class: 'formulaire' }, h('label', {}, t('memoire.filtreType'), type),
        h('label', { class: 'coche', title: t('memoire.aCorrigerAide') }, corrige, ` ${t('memoire.aCorriger')}`),
        h('label', { class: 'recherche' }, t('memoire.rechercher'), recherche), nombre)),
    memoZones.zoneNouveau, memoZones.zoneListe, memoZones.zoneFichiers);
  dessinerMemoire();
}
async function rechargerMemoire() {
  const d = await api('/api/memoire').catch(() => null);
  if (d) Object.assign(memo, { entrees: d.entrees, projets: d.projets, fichiers: d.fichiers });
  dessinerMemoire();
}
function dessinerMemoire() {
  if (!memoZones) return;
  const { zoneChips, nombre, zoneListe } = memoZones;
  // Scope chips: all, global, then every project that has entries (short name, full path in the tooltip).
  const projets = new Map();
  for (const e of memo.entrees) if (e.portee !== 'global' && !projets.has(cleDossier(e.portee))) projets.set(cleDossier(e.portee), e.portee);
  if (memo.portee !== '*' && memo.portee !== 'global' && !projets.has(memo.portee)) memo.portee = '*';
  const puce = (valeur, libelle, titre) => h('button', { class: `puce cliquable${memo.portee === valeur ? ' actif' : ''}`, title: titre, 'aria-pressed': String(memo.portee === valeur),
    onclick: () => { memo.portee = valeur; dessinerMemoire(); } }, libelle);
  zoneChips.replaceChildren(puce('*', t('memoire.tout')), puce('global', t('memoire.global')),
    ...[...projets].sort((a, b) => nomDossier(a[1]).localeCompare(nomDossier(b[1]))).map(([cle, dossier]) => puce(cle, nomDossier(dossier), dossier)));

  const q = memo.q.trim().toLowerCase();
  const visibles = memo.entrees.filter((e) => (memo.portee === '*' || porteeDe(e) === memo.portee) && (!memo.type || e.type === memo.type) && (!memo.aCorriger || e.corrigeable)
    && (!q || [e.texte, e.sujet, e.probleme, e.solution, e.portee].join(' ').toLowerCase().includes(q)));
  nombre.textContent = t('memoire.nbEntrees', { n: visibles.length });

  // Grouped by scope (global first, then projects), then by topic.
  const groupes = new Map();
  for (const e of visibles) {
    const g = groupes.get(porteeDe(e)) || { portee: e.portee, sujets: new Map() };
    groupes.set(porteeDe(e), g);
    g.sujets.set(e.sujet || '', [...(g.sujets.get(e.sujet || '') || []), e]);
  }
  const ordre = [...groupes.values()].sort((a, b) => (a.portee === 'global' ? -1 : b.portee === 'global' ? 1 : nomDossier(a.portee).localeCompare(nomDossier(b.portee))));
  zoneListe.replaceChildren(...(ordre.length ? ordre.map((g) => h('section', { class: 'groupe-memoire' },
    g.portee === 'global' ? h('h2', {}, t('memoire.global'))
      : h('h2', { title: g.portee }, nomDossier(g.portee), h('span', { class: 'muet petit' }, `  ${g.portee}`)),
    [...g.sujets].sort((a, b) => a[0].localeCompare(b[0])).map(([sujet, liste]) => h('div', { class: 'sujet-memoire' },
      h('h3', {}, sujet),
      liste.sort((a, b) => String(a.cree).localeCompare(String(b.cree))).map(carteMemoire)))))
    : [h('p', { class: 'vide' }, memo.entrees.length ? t('memoire.aucunResultat') : t('memoire.vide'))]));
  dessinerFichiers();
}

function carteMemoire(e) {
  if (memo.edition === e.id) return formulaireMemoire(e);
  const actif = e.actif !== false;
  const interrupteur = h('label', { class: 'entree-sw', title: actif ? t('memoire.donnee') : t('memoire.desactivee') },
    h('input', { type: 'checkbox', checked: actif, 'aria-label': t('memoire.activerNom', { texte: String(e.texte).slice(0, 80) }), onchange: async (ev) => {
      const c = ev.currentTarget; c.disabled = true;
      try {
        const r = await api('/api/memoire/modifier', { id: e.id, actif: c.checked });
        Object.assign(e, r.entree);
        toast(r.entree.actif ? t('memoire.activee') : t('memoire.desactiveeToast'));
      } catch (err) { toast(err.message, true); }
      dessinerMemoire();
    } }),
    h('span', { class: 'glissiere', 'aria-hidden': 'true' }));
  return h('div', { class: `carte entree${actif ? '' : ' eteinte'}` },
    h('div', { class: 'entree-tete' },
      h('span', { class: `badge ${BADGE_TYPE[e.type] || 'neutre'}` }, NOM_TYPE[e.type] ? t(NOM_TYPE[e.type]) : e.type),
      e.corrigeable ? h('span', { class: 'badge grave', title: t('memoire.corrigeableAide') }, t('memoire.corrigeable')) : null,
      h('span', { class: 'espace' }),
      !actif ? h('span', { class: 'muet petit' }, t('memoire.desactivee')) : null,
      interrupteur),
    h('p', { class: 'entree-texte' }, e.texte),
    e.probleme || e.solution ? h('dl', { class: 'entree-details' },
      e.probleme ? [h('dt', {}, t('memoire.probleme')), h('dd', {}, e.probleme)] : null,
      e.solution ? [h('dt', {}, t('memoire.solution')), h('dd', {}, e.solution)] : null) : null,
    h('div', { class: 'muet petit' }, [NOM_ORIGINE[e.origine] ? t(NOM_ORIGINE[e.origine]) : null, t('memoire.dates', { cree: date(e.cree), maj: date(e.maj) })].filter(Boolean).join(' · ')),
    h('div', { class: 'actions' },
      h('button', { class: 'bouton', onclick: () => { memo.edition = e.id; dessinerMemoire(); } }, t('memoire.modifier')),
      h('button', { class: 'bouton', onclick: async (ev) => {
        if (!confirm(t('memoire.confirmerSuppression', { texte: e.texte }))) return;
        ev.currentTarget.disabled = true;
        try { await api('/api/memoire/supprimer', { id: e.id }); toast(t('memoire.supprimee')); } catch (err) { toast(err.message, true); }
        await rechargerMemoire();
      } }, t('memoire.supprimer'))));
}

// Add / edit form (same fields). `e` = the entry to edit, null = a new one.
function ouvrirFormulaireMemoire() {
  if (!memoZones) return;
  memo.edition = null;
  memoZones.zoneNouveau.replaceChildren(formulaireMemoire(null));
  memoZones.zoneNouveau.querySelector('input')?.focus();
  dessinerMemoire();
}
function formulaireMemoire(e) {
  const AUTRE = '__autre__';
  const fermer = () => { if (e) { memo.edition = null; dessinerMemoire(); } else memoZones.zoneNouveau.replaceChildren(); };
  const texte = h('input', { type: 'text', value: e?.texte || '', maxlength: '300' });
  const sujet = h('input', { type: 'text', value: e?.sujet || '', maxlength: '30' });
  const type = h('select', {}, TYPES_MEMOIRE.map((k) => h('option', { value: k, selected: (e?.type || 'regle') === k }, t(NOM_TYPE[k]))));
  const autre = h('input', { type: 'text', placeholder: t('projet.exemple'), hidden: true });
  const portee = h('select', { onchange: () => { autre.hidden = portee.value !== AUTRE; } },
    h('option', { value: 'global' }, t('memoire.global')),
    memo.projets.map((p) => h('option', { value: p, title: p }, `${nomDossier(p)}  (${p})`)),
    h('option', { value: AUTRE }, t('memoire.autreDossier')));
  const voulue = e ? e.portee : (memo.portee === '*' ? 'global' : memo.portee === 'global' ? 'global' : memo.projets.find((p) => cleDossier(p) === memo.portee) || 'global');
  portee.value = voulue === 'global' ? 'global' : memo.projets.find((p) => cleDossier(p) === cleDossier(voulue)) || 'global';
  const probleme = h('textarea', { rows: '2', maxlength: '800' }, e?.probleme || '');
  const solution = h('textarea', { rows: '2', maxlength: '800' }, e?.solution || '');
  const corrigeable = h('input', { type: 'checkbox', checked: e?.corrigeable === true });
  const enregistrer = h('button', { class: 'bouton principal', onclick: async () => {
    let choix = portee.value === AUTRE ? autre.value.trim() : portee.value;
    if (e && e.portee !== 'global' && choix !== 'global' && cleDossier(choix) === cleDossier(e.portee)) choix = e.portee; // unchanged: keep the stored spelling
    const corps = { texte: texte.value, sujet: sujet.value, type: type.value, portee: choix, corrigeable: corrigeable.checked };
    if (e || probleme.value.trim()) corps.probleme = probleme.value;
    if (e || solution.value.trim()) corps.solution = solution.value;
    enregistrer.disabled = true;
    try {
      const r = e ? await api('/api/memoire/modifier', { id: e.id, ...corps }) : await api('/api/memoire/ajouter', corps);
      toast(e ? t('memoire.enregistree') : r.doublon ? t('memoire.dejaPresente') : t('memoire.ajoutee'));
      if (e) memo.edition = null; else memoZones.zoneNouveau.replaceChildren();
      await rechargerMemoire();
    } catch (err) { toast(err.message, true); enregistrer.disabled = false; }
  } }, t('memoire.enregistrer'));
  return h('div', { class: 'carte entree editeur' },
    e ? null : h('h3', {}, t('memoire.formNouveau')),
    h('label', {}, t('memoire.champTexte'), texte),
    h('div', { class: 'formulaire' },
      h('label', {}, t('memoire.champSujet'), sujet), h('label', {}, t('memoire.champType'), type),
      h('label', {}, t('memoire.champPortee'), h('span', { class: 'choix-projet' }, portee, autre))),
    h('label', {}, t('memoire.champProbleme'), probleme),
    h('label', {}, t('memoire.champSolution'), solution),
    h('label', { class: 'coche' }, corrigeable, ` ${t('memoire.champCorrigeable')}`),
    h('p', { class: 'muet petit' }, t('memoire.secretAide')),
    h('div', { class: 'actions' }, enregistrer, h('button', { class: 'bouton', onclick: fermer }, t('memoire.annuler'))));
}

// Rules chat: a conversation with Claude about the registry only (tableau/chat-regles.mjs). It has no tool
// and changes nothing itself: its proposals come as cards, each applied only on a click, through the same
// /api/memoire/* routes as the form. Kept while the window lives (switching tabs does not lose it).
const chatR = { session: null, messages: [], enCours: null, zone: null }; // messages: { qui: 'moi' | 'claude', texte, actions, erreur, note }
const NOM_ACTION = { ajouter: 'chat.action.ajouter', modifier: 'chat.action.modifier', activer: 'chat.action.activer', desactiver: 'chat.action.desactiver', supprimer: 'chat.action.supprimer' };
const BADGE_ACTION = { supprimer: 'grave', desactiver: 'alerte', ajouter: 'bon' };
const NOM_CHAMP = { texte: 'chat.champ.texte', sujet: 'chat.champ.sujet', type: 'chat.champ.type', portee: 'chat.champ.portee', probleme: 'chat.champ.probleme', solution: 'chat.champ.solution', corrigeable: 'chat.champ.corrigeable' };
const SUGGESTIONS = ['chat.suggestion.point', 'chat.suggestion.doublons', 'chat.suggestion.vagues'];
// Proposal blocks are turned into cards by the server at the end; while the answer streams in, hide them
// (a block still being written too).
const sansBlocs = (s) => String(s || '').replace(/```relais-action[\s\S]*?```/g, '').replace(/```relais-action[\s\S]*$/, '').replace(/\n{3,}/g, '\n\n').trim();

function carteChat() {
  const fil = h('div', { class: 'chat-fil', 'aria-live': 'polite' });
  const saisie = h('textarea', { rows: '2', maxlength: '4000', placeholder: t('chat.placeholder'), 'aria-label': t('chat.placeholder'),
    onkeydown: (ev) => { if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); envoyer(); } } });
  const envoyer = (texte) => {
    const m = String(texte ?? saisie.value).trim();
    if (!m || chatR.enCours) return;
    if (texte === undefined) saisie.value = '';
    envoyerChat(m);
  };
  const bEnvoyer = h('button', { class: 'bouton principal', onclick: () => envoyer() }, t('chat.envoyer'));
  const bArreter = h('button', { class: 'bouton', onclick: () => chatR.enCours?.abort() }, t('chat.arreter'));
  const bNouvelle = h('button', { class: 'bouton', onclick: () => {
    chatR.enCours?.abort();
    Object.assign(chatR, { session: null, messages: [] });
    dessinerChat(); saisie.focus();
  } }, t('chat.nouvelle'));
  chatR.zone = { fil, saisie, bEnvoyer, bArreter, envoyer };
  const carte = h('div', { class: 'carte bloc chat' }, h('h2', {}, t('chat.titre')), h('p', { class: 'muet' }, t('chat.aide')), fil,
    h('div', { class: 'chat-saisie' }, saisie, h('div', { class: 'actions' }, bEnvoyer, bArreter, bNouvelle)));
  dessinerChat();
  return carte;
}
function dessinerChat() {
  const z = chatR.zone;
  if (!z) return;
  z.bEnvoyer.hidden = !!chatR.enCours; z.bArreter.hidden = !chatR.enCours;
  z.fil.replaceChildren(...(chatR.messages.length ? chatR.messages.map(bulleChat)
    : [h('div', { class: 'chat-vide' }, h('p', { class: 'muet' }, t('chat.vide')),
      h('div', { class: 'actions' }, SUGGESTIONS.map((k) => h('button', { class: 'bouton', onclick: () => z.envoyer(t(k)) }, t(k)))))]));
  z.fil.scrollTop = z.fil.scrollHeight;
}
// Claude's text: only **bold** and `code` are rendered, as elements built here (never as HTML).
const enLigne = (texte) => String(texte).split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/).map((x) => (/^\*\*[^*\n]+\*\*$/.test(x) ? h('strong', {}, x.slice(2, -2))
  : /^`[^`\n]+`$/.test(x) ? h('code', {}, x.slice(1, -1)) : x));
// The final text carries \u0001<n>\u0001 where proposal n was written: its card goes right there.
function bulleChat(m) {
  if (m.qui === 'moi') return h('div', { class: 'chat-msg moi' }, h('p', { class: 'chat-texte' }, m.texte));
  const texte = sansBlocs(m.texte);
  const morceaux = texte.split(/\u0001(\d+)\u0001/).map((x, i) => (i % 2 ? (m.actions?.[Number(x)] ? carteAction(m.actions[Number(x)]) : null)
    : x.trim() ? h('p', { class: 'chat-texte' }, enLigne(x.trim())) : null));
  const placees = new Set([...texte.matchAll(/\u0001(\d+)\u0001/g)].map((x) => Number(x[1])));
  return h('div', { class: 'chat-msg claude' },
    texte ? morceaux : !m.fini && !m.erreur ? h('p', { class: 'chat-texte muet' }, t('chat.reflechit')) : null,
    (m.actions || []).filter((_, i) => !placees.has(i)).map(carteAction),
    m.note ? h('p', { class: 'muet petit' }, m.note) : null,
    m.erreur ? h('p', { class: 'attention' }, m.erreur) : null);
}
function valeurChamp(k, v) {
  if (k === 'type') return NOM_TYPE[v] ? t(NOM_TYPE[v]) : String(v ?? '');
  if (k === 'corrigeable') return t(v ? 'chat.oui' : 'chat.non');
  if (k === 'portee') return v === 'global' ? t('memoire.global') : String(v ?? '');
  return v ? String(v) : t('chat.champVide');
}
function carteAction(a) {
  const e = a.id ? memo.entrees.find((x) => x.id === a.id) : null;
  const lignes = a.action === 'ajouter' ? Object.entries(a.entree).map(([k, v]) => h('div', {}, h('dt', {}, t(NOM_CHAMP[k])), h('dd', {}, valeurChamp(k, v))))
    : a.action === 'modifier' ? Object.entries(a.champs).map(([k, v]) => h('div', {}, h('dt', {}, t(NOM_CHAMP[k])),
      h('dd', {}, e ? [h('del', {}, valeurChamp(k, e[k])), h('span', { class: 'muet' }, '  >  ')] : null, h('ins', {}, valeurChamp(k, v)))))
      : [];
  return h('div', { class: `carte chat-action${a.fait ? ' faite' : ''}` },
    h('div', { class: 'entree-tete' },
      h('span', { class: `badge ${BADGE_ACTION[a.action] || 'neutre'}` }, t(NOM_ACTION[a.action])),
      h('span', { class: 'espace' }),
      a.fait ? h('span', { class: 'badge bon' }, t('chat.applique')) : null),
    a.id ? h('p', { class: e ? 'entree-texte' : 'muet' }, e ? e.texte : t('chat.entreeAbsente')) : null,
    lignes.length ? h('dl', { class: 'chat-champs' }, lignes) : null,
    a.pourquoi ? h('p', { class: 'muet petit' }, a.pourquoi) : null,
    a.fait || (a.id && !e) ? null : h('div', { class: 'actions' },
      h('button', { class: `bouton${a.action === 'supprimer' ? '' : ' principal'}`, onclick: (ev) => appliquerAction(a, ev.currentTarget) }, t('chat.appliquer'))));
}
async function appliquerAction(a, bouton) {
  if (a.action === 'supprimer' && !confirm(t('memoire.confirmerSuppression', { texte: memo.entrees.find((x) => x.id === a.id)?.texte || a.id }))) return;
  const [route, corps] = {
    ajouter: ['ajouter', a.entree], modifier: ['modifier', { ...a.champs, id: a.id }],
    activer: ['modifier', { id: a.id, actif: true }], desactiver: ['modifier', { id: a.id, actif: false }], supprimer: ['supprimer', { id: a.id }],
  }[a.action];
  bouton.disabled = true;
  try {
    await api(`/api/memoire/${route}`, corps);
    a.fait = true; toast(t('chat.appliqueToast'));
    await rechargerMemoire();
  } catch (e) { toast(e.message, true); bouton.disabled = false; return; }
  dessinerChat();
}
// One message: the answer streams in as JSON lines ({ type: 'session' | 'texte' | 'fin' | 'erreur' }).
async function envoyerChat(message) {
  const ctl = new AbortController();
  const rep = { qui: 'claude', texte: '', fini: false };
  chatR.messages.push({ qui: 'moi', texte: message }, rep);
  chatR.enCours = ctl;
  dessinerChat();
  let image = 0;
  const redessiner = () => { if (!image) image = requestAnimationFrame(() => { image = 0; dessinerChat(); }); };
  try {
    const r = await fetch('/api/memoire/chat', { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', 'X-Relais': '1' },
      body: JSON.stringify({ message, session: chatR.session, dossiers: memo.projets }) });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      if (r.status === 401 && j.connexion === false) verrouiller();
      throw new Error(j.message || j.erreur || t('commun.erreurHttp', { code: r.status }));
    }
    const lecteur = r.body.pipeThrough(new TextDecoderStream()).getReader();
    let tampon = '';
    for (;;) {
      const { value, done } = await lecteur.read();
      if (done) break;
      tampon += value;
      let i;
      while ((i = tampon.indexOf('\n')) >= 0) {
        const ev = JSON.parse(tampon.slice(0, i));
        tampon = tampon.slice(i + 1);
        if (ev.type === 'session') chatR.session = ev.session;
        else if (ev.type === 'texte') { rep.texte += ev.texte; redessiner(); }
        else if (ev.type === 'fin') {
          if (ev.session) chatR.session = ev.session;
          Object.assign(rep, { texte: ev.texte, actions: ev.actions, fini: true, note: ev.ignorees ? t('chat.ignorees', { n: ev.ignorees }) : null });
        } else if (ev.type === 'erreur') rep.erreur = ev.message;
      }
    }
    if (!rep.fini && !rep.erreur) rep.erreur = t('chat.coupe');
  } catch (e) { rep.erreur = ctl.signal.aborted ? t('chat.arrete') : e.message; }
  rep.fini = true;
  if (chatR.enCours === ctl) chatR.enCours = null;
  dessinerChat();
  if (chatR.zone?.saisie.isConnected) chatR.zone.saisie.focus();
}

// Instruction files Claude Code really loaded (read-only): path, type, reason, last load, preview of the current content.
function dessinerFichiers() {
  const l = memo.fichiers;
  const entete = (f) => h('span', { class: 'fichier-tete' },
    h('code', { class: 'chemin' }, f.chemin),
    h('span', { class: 'puces' },
      f.type ? h('span', { class: 'puce' }, f.type) : null,
      f.raison ? h('span', { class: 'puce' }, NOM_RAISON[f.raison] ? t(NOM_RAISON[f.raison]) : f.raison) : null,
      h('span', { class: 'puce' }, t('memoire.fichiers.vu', { date: date(f.le) })),
      !f.existe ? h('span', { class: 'badge alerte' }, t('memoire.fichiers.absent')) : null),
    f.parent ? h('span', { class: 'muet petit' }, t('memoire.fichiers.depuis', { parent: f.parent })) : null);
  memoZones.zoneFichiers.replaceChildren(h('h2', {}, t('memoire.fichiers.titre')), h('p', { class: 'aide' }, t('memoire.fichiers.aide')),
    l.length ? h('ul', { class: 'fichiers' }, l.map((f) => h('li', {}, f.existe
      ? h('details', {}, h('summary', {}, entete(f)),
        h('div', { class: 'muet petit' }, `${t('memoire.fichiers.apercu')}${f.tronque ? ` ${t('memoire.fichiers.tronque')}` : ''}`),
        h('pre', { class: 'apercu' }, f.apercu || t('memoire.fichiers.vide')))
      : entete(f))))
      : h('p', { class: 'muet' }, t('memoire.fichiers.aucun')));
}

// ------------------------------------------------------------------ devil's advocate
function afficherAvocat() {
  const a = etat.avocat;
  const page = $('#page-avocat');
  const coche = h('input', { type: 'checkbox', id: 'coche-avocat', checked: a.actif, onchange: async (ev) => {
    const voulu = ev.currentTarget.checked;
    try { const r = await api('/api/avocat', { actif: voulu }); etat.avocat.actif = r.actif; etat.avocat.depuis = r.depuis; toast(r.actif ? t('avocat.active') : t('avocat.desactive')); }
    catch (e) { toast(e.message, true); }
    majPastille(); afficherAvocat();
  } });
  const liste = (cles) => h('ol', { class: 'etapes' }, cles.map((k) => h('li', {}, t(k))));
  page.replaceChildren(
    h('div', { class: 'entete' }, h('div', {}, h('h1', {}, t('nav.avocat')),
      h('p', {}, t('avocat.intro')))),
    // Two different things, both called "on" elsewhere: the plugin (listed among the skills of every
    // conversation once installed) and the checking mode (this switch).
    a.installe ? h('p', { class: 'muet' }, t(a.actif ? 'avocat.pluginEtModeOn' : 'avocat.pluginSansMode')) : null,
    h('div', { class: 'carte' }, h('label', { class: 'interrupteur', for: 'coche-avocat' }, coche, h('span', { class: 'glissiere', 'aria-hidden': 'true' }),
      h('div', {}, h('div', { class: 'etat' }, a.actif ? t('avocat.etatOn') : t('avocat.etatOff')),
        h('div', { class: 'muet' }, a.actif ? t('avocat.depuis', { date: date(a.depuis) }) : t('avocat.cocher')))),
      !a.installe ? h('div', { class: 'avertissement' }, `${t('avocat.pasInstalle')} `,
        h('button', { class: 'lien', onclick: () => allerA('skills') }, t('avocat.allerInstaller'))) : null),
    h('div', { class: 'grille-2' },
      h('div', { class: 'carte' }, h('h2', {}, t('commun.commentCaMarche')),
        liste(['avocat.etape1', 'avocat.etape2', 'avocat.etape3', 'avocat.etape4'])),
      h('div', { class: 'carte' }, h('h2', {}, t('commun.bonASavoir')),
        liste(['avocat.savoir1', 'avocat.savoir2', 'avocat.savoir3', 'avocat.savoir4']))),
  );
}
function majPastille() {
  const p = $('#pastille-avocat');
  p.textContent = etat.avocat.actif ? t('commun.on') : t('commun.off');
  p.classList.toggle('on', etat.avocat.actif);
}

// ------------------------------------------------------------------ settings (desktop app only)
// The routes /api/bureau/* only exist in the Relais desktop app (Electron); from the command line they
// answer 404 and the "Paramètres" tab stays hidden.
let bureau = null;
let bureauVu = '';
async function chargerBureau() {
  const r = await fetch('/api/bureau/etat').catch(() => null);
  if (!r || !r.ok) return null;
  const b = await r.json().catch(() => null);
  if (!b) return null;
  bureau = b;
  $('#nav-parametres').hidden = false;
  $('#pastille-maj').hidden = !['disponible', 'pret'].includes(b.maj?.statut);
  const vu = JSON.stringify(b);
  if (vu !== bureauVu) { bureauVu = vu; if (etat.page === 'parametres') afficherParametres(); }
  return b;
}
async function actionBureau(chemin, corps = {}) {
  try { await api(chemin, corps); } catch (e) { toast(e.message, true); }
  await chargerBureau();
}
const mo = (n) => t('nb.mo', { n: (Number(n || 0) / 1048576).toLocaleString(LOC, { maximumFractionDigits: 1 }) });
function blocMaj(m) {
  const quand = m.derniere ? h('div', { class: 'muet petit' }, t('param.derniere', { date: date(m.derniere) })) : null;
  const bouton = (texte, chemin, principal = false) => h('button', { class: principal ? 'bouton principal' : 'bouton', onclick: (ev) => { ev.currentTarget.disabled = true; actionBureau(chemin); } }, texte);
  switch (m.statut) {
    case 'desactive': return [h('p', { class: 'muet' }, m.message)];
    case 'verification': return [h('p', {}, t('param.recherche'))];
    case 'disponible': return [
      h('p', { class: 'maj-titre' }, t('param.disponible', { version: m.version })),
      m.notes ? h('div', { class: 'notes-version' }, m.notes) : h('p', { class: 'muet' }, t('param.pasDeNotes')),
      h('div', { class: 'actions' }, bouton(t('param.telecharger'), '/api/bureau/maj/telecharger', true)),
      quand];
    case 'telechargement': return [
      h('p', {}, t('param.telechargement', { version: m.version })),
      h('progress', { class: 'progression', max: '100', value: String(Math.round(m.pourcentage || 0)) }),
      h('div', { class: 'muet petit' }, `${pc(Math.round(m.pourcentage || 0))} · ${mo(m.recu)} / ${mo(m.total)}`)];
    case 'pret': return [
      h('p', { class: 'maj-titre' }, t('param.prete', { version: m.version })),
      h('p', { class: 'muet' }, t('param.redemarrage')),
      h('div', { class: 'actions' }, bouton(t('param.redemarrerInstaller'), '/api/bureau/maj/installer', true))];
    default: return [
      h('p', { class: m.statut === 'impossible' ? 'muet' : '' }, m.message || t('param.aucuneVerification')),
      quand,
      h('div', { class: 'actions' }, bouton(t('param.verifier'), '/api/bureau/maj/verifier'))];
  }
}
function afficherParametres() {
  const b = bureau;
  const page = $('#page-parametres');
  if (!b) { page.replaceChildren(h('p', { class: 'muet' }, t('param.horsBureau'))); return; }
  const d = b.demarrage || {};
  const coche = h('input', { type: 'checkbox', id: 'coche-demarrage', checked: d.actif, disabled: !d.disponible,
    onchange: (ev) => actionBureau('/api/bureau/demarrage', { actif: ev.currentTarget.checked }) });
  page.replaceChildren(
    h('div', { class: 'entete' }, h('div', {}, h('h1', {}, t('nav.parametres')), h('p', {}, t('param.intro')))),
    h('div', { class: 'carte' }, h('label', { class: 'interrupteur', for: 'coche-demarrage' }, coche, h('span', { class: 'glissiere', 'aria-hidden': 'true' }),
      h('div', {}, h('div', { class: 'etat' }, t('param.demarrage')),
        h('div', { class: 'muet' }, !d.disponible ? t('param.demarrageIndispo')
          : d.actif ? t('param.demarrageOn') : t('param.demarrageOff'))))),
    h('div', { class: 'grille-2' },
      h('div', { class: 'carte' }, h('h2', {}, t('param.majs')), h('p', {}, `${t('param.versionInstallee')} `, h('b', {}, b.version)), ...blocMaj(b.maj || {})),
      h('div', { class: 'carte' }, h('h2', {}, t('commun.bonASavoir')),
        h('ol', { class: 'etapes' },
          h('li', {}, t('param.savoir1', { source: b.maj?.source || 'GitHub' })),
          h('li', {}, t('param.savoir2')),
          h('li', {}, t('param.savoir3'))))),
  );
}
const bureauPret = chargerBureau(); // awaited before restoring the last page shown
setInterval(() => { if (bureau) chargerBureau(); }, 2000);

// ------------------------------------------------------------------ refresh loop
let dernierePhrase = '';
async function rafraichirEtat() {
  const e = await api('/api/etat').catch(() => null);
  if (!e) { $('#indexation').textContent = t('app.serveurArrete'); return; }
  const changeAvocat = e.avocat.actif !== etat.avocat.actif || e.avocat.installe !== etat.avocat.installe;
  etat.avocat = e.avocat; etat.relais = e.relais || { installe: false }; majPastille();
  if (changeAvocat && etat.page === 'avocat') afficherAvocat();
  const i = e.indexation;
  const nb = etat.conversations.length;
  const phrase = i.enCours ? t('app.progression', { fait: nf.format(i.fait), total: nf.format(i.total) }) : t('app.aJour', { nb: nf.format(nb), n: nb });
  $('#indexation').textContent = phrase;
  return phrase !== dernierePhrase && (dernierePhrase = phrase);
}
async function rafraichirConversations() {
  const l = await api('/api/conversations').catch(() => null);
  if (!l) return;
  const avant = JSON.stringify(etat.conversations.map((c) => [c.id, c.tot.appels]));
  etat.conversations = l.map((c) => ({ ...c, titre: libre(c.titre) }));
  if (JSON.stringify(l.map((c) => [c.id, c.tot.appels])) === avant) return;
  remplirProjets();
  if (etat.page === 'conversations') { afficherListe(); afficherOnglets(); if (etat.actif) afficherDetail(true); }
  if (etat.page === 'vue') afficherVue();
}
$('#actualiser').addEventListener('click', async () => { await api('/api/actualiser', {}).catch(() => {}); toast(t('app.relectureLancee')); setTimeout(cycle, 1500); });
async function cycle() { await rafraichirEtat(); await rafraichirConversations(); await rafraichirEtat(); }

// ------------------------------------------------------------------ Claude account
let demarre = false;
function verrouiller(raison, introuvable) {
  $('#connexion').hidden = false;
  const r = $('#connexion-raison');
  r.hidden = !raison; r.textContent = raison || '';
  if (raison !== undefined) $('#connexion-absent').hidden = !introuvable; // Claude Code not installed: how to install it
}
function afficherCompte(c) {
  const z = $('#compte');
  const nom = c.nom || c.email || t('compte.defaut');
  z.replaceChildren(
    h('div', { class: 'avatar', 'aria-hidden': 'true' }, nom.trim().charAt(0).toUpperCase() || '?'),
    h('div', { class: 'qui' },
      c.abonnement ? h('div', { class: 'plan' }, `Claude ${c.abonnement}`) : null,
      h('div', { title: nom }, nom),
      c.email && c.email !== nom ? h('div', { class: 'muet', title: c.email }, c.email) : null));
  z.title = c.organisation ? t('compte.organisation', { nom: c.organisation }) : '';
  z.hidden = false;
}
async function verifierCompte(forcer) {
  const c = forcer ? await api('/api/compte/verifier', {}).catch(() => null) : await api('/api/compte').catch(() => null);
  if (!c) { verrouiller(t('compte.serveurMuet')); return false; }
  if (!c.connecte) { $('#compte').hidden = true; verrouiller(c.raison, c.introuvable === true); return false; }
  $('#connexion').hidden = true;
  afficherCompte(c);
  if (!demarre) {
    demarre = true;
    await cycle();
    await bureauPret;
    allerA(['vue', 'conversations', 'skills', 'gestion', 'memoire', 'avocat', ...(bureau ? ['parametres'] : [])].includes(etat.page) ? etat.page : 'vue');
    setInterval(cycle, 4000);
    setInterval(() => verifierCompte(false), 60000);
  }
  return true;
}
$('#verifier-compte').addEventListener('click', async (ev) => {
  ev.currentTarget.disabled = true;
  const ok = await verifierCompte(true);
  ev.currentTarget.disabled = false;
  if (!ok) toast(t('compte.toujoursPas'), true);
});
const URL_DOC = 'https://docs.claude.com/en/docs/claude-code/setup'; // the app refuses external navigation: copyable text
$('#url-doc').textContent = URL_DOC;
$('#copier-doc').addEventListener('click', () => navigator.clipboard.writeText(URL_DOC).then(() => toast(t('commun.copie'))));
$('#copier-login').addEventListener('click', () => navigator.clipboard.writeText('claude auth login').then(() => toast(t('commun.commandeCopiee'))));
verifierCompte(false);
