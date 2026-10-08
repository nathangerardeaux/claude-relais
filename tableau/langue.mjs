// Language of the dashboard: the system language, French or English only (English by default).
// Order: TABLEAU_LANGUE (tests) -> RELAIS_LANGUE (set by the desktop app from Electron) -> the locale
// Node reports -> LANG -> 'en'. The first non-empty value decides: 'fr' when it starts with "fr".

// 'fr' or 'en' from a locale name such as 'fr-FR', 'en-GB', 'de_DE.UTF-8'.
export const langueDe = (valeur) => (/^fr/i.test(String(valeur || '').trim()) ? 'fr' : 'en');

export function langueSysteme() {
  let intl = '';
  try { intl = Intl.DateTimeFormat().resolvedOptions().locale; } catch { /* no Intl */ }
  const sources = [process.env.TABLEAU_LANGUE, process.env.RELAIS_LANGUE, intl, process.env.LANG];
  return langueDe(sources.map((v) => String(v || '').trim()).find(Boolean));
}

// Picks the text of the system language from a { fr, en } pair (anything else is returned as is).
export const tr = (paire) => (paire && typeof paire === 'object' && 'fr' in paire && 'en' in paire ? paire[langueSysteme()] : paire);
