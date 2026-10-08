// Calendar helpers of the dashboard (pure, no DOM): local-day keys, weeks starting on Monday, months, and the
// buckets of the "tokens per day" chart. Also imported by tableau/tester.mjs.

export const cleJour = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// Date (local noon, safe around daylight saving changes) of a day key.
export const dateDe = (cle) => { const [y, m, j] = cle.split('-').map(Number); return new Date(y, m - 1, j, 12); };
export const plusJours = (cle, n) => { const [y, m, j] = cle.split('-').map(Number); return cleJour(new Date(y, m - 1, j + n, 12)); };
// Monday of the week holding `cle` (the week runs Monday to Sunday).
export const debutSemaine = (cle) => plusJours(cle, -((dateDe(cle).getDay() + 6) % 7));
export const debutMois = (cle) => `${cle.slice(0, 7)}-01`;
export const finMois = (cle) => { const [y, m] = cle.split('-').map(Number); return cleJour(new Date(y, m, 0, 12)); };

// Buckets of the chart, oldest first. Each: { x: key, debut, fin (both included, day keys), y: tokens }.
//   '30j'  : the last 30 days, one bar per day
//   '12m'  : the last 12 months, one bar per week (53 bars: the current week and the 52 before it)
//   'tout' : one bar per month, from the first month with data (at least the last 12 months)
// `jours` maps day keys to tokens; `aujourdhui` is a day key.
export function seaux(jours, mode, aujourdhui) {
  const liste = [];
  if (mode === '12m') {
    const premier = plusJours(debutSemaine(aujourdhui), -52 * 7);
    for (let d = premier; d <= aujourdhui; d = plusJours(d, 7)) liste.push({ x: d, debut: d, fin: plusJours(d, 6) });
  } else if (mode === 'tout') {
    const connus = Object.keys(jours).filter((j) => jours[j] > 0).sort();
    const douze = debutMois(plusJours(`${aujourdhui.slice(0, 7)}-01`, -330)); // 12 months including the current one
    let m = connus.length && debutMois(connus[0]) < douze ? debutMois(connus[0]) : douze;
    for (; m <= aujourdhui; m = plusJours(finMois(m), 1)) liste.push({ x: m.slice(0, 7), debut: m, fin: finMois(m) });
  } else {
    for (let i = 29; i >= 0; i--) { const d = plusJours(aujourdhui, -i); liste.push({ x: d, debut: d, fin: d }); }
  }
  // one pass over the days, not one per bucket
  const parCle = new Map(liste.map((s) => [s.x, s]));
  for (const s of liste) s.y = 0;
  for (const [j, v] of Object.entries(jours)) {
    const cle = mode === '12m' ? debutSemaine(j) : mode === 'tout' ? j.slice(0, 7) : j;
    const s = parCle.get(cle);
    if (s) s.y += v;
  }
  return liste;
}
