// Switch for devil's advocate mode. Usage: node basculer.mjs on|off|status
// (the /avocat skill and the relais dashboard write the same state file).
import { lireEtat, ecrireEtat, T } from './commun.mjs';

const arg = String(process.argv[2] || 'status').toLowerCase();
const t = T();
if (['on', 'oui', 'activer', '1'].includes(arg)) { ecrireEtat(true); console.log(t.on); }
else if (['off', 'non', 'desactiver', 'désactiver', '0'].includes(arg)) { ecrireEtat(false); console.log(t.off); }
else { const e = lireEtat(); console.log(t.statut(e.actif, e.depuis)); }
