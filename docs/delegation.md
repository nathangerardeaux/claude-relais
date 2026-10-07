# Délégation des longues tâches : mesures (06/10/2026)

Question : quand une tâche n'a pas besoin de l'historique, la confier à un sous-agent fait-il
vraiment économiser des tokens ? Réponse : oui pour les longues tâches (plus d'une dizaine de lectures),
surtout si le sous-agent tourne sur un modèle moins cher, et la conversation reste légère ensuite.
Non pour les tâches courtes : le sous-agent paie sa propre base.

## Protocole

- `claude -p` (Claude Code 2.1.291, Opus 5.5 en session principale), `--setting-sources project` pour
  couper les plugins et hooks de l'utilisateur, sur une copie du dépôt.
- Une session « de base » rendue lourde (8 fichiers du tableau lus, environ 112 k tokens), puis
  chaque essai part d'une copie identique (`--resume <base> --fork-session`).
- Mesures tirées de la sortie JSON (`total_cost_usd`, `modelUsage`, sous-agents compris) et du journal
  de la session (taille de la conversation principale à la fin).
- Qualité : tâche T6 notée par un script (nombre de lignes et noms exportés de 13 scripts, comparés à
  la vérité calculée).

Tâches : T6 = lire 13 scripts un par un et rendre lignes + exports en JSON ; T4 = revue des 26 fichiers
de `plugins/` (rôle + textes non traduits) ; T1 = fonctions exportées jamais importées (environ
5 appels) ; T3 = une version dans un `package.json` (1 appel).

## Résultats

Modèle du sous-agent (T6, délégation forcée, session de 112 k) :

| Variante | Coût | Conversation après | Qualité | Durée |
|---|---|---|---|---|
| Sans délégation | 1,57 $ | 190 k | 13/13 | 25 s |
| Sous-agent Opus (hérité) | 1,37 $ | 134 k | 13/13 (±1) | 282 s, 3 agents |
| Explore | 1,50 $ | 132 k | 13/13 | 34 s |
| Sous-agent Sonnet | 1,30 $ | 132 k | 13/13 (±1) | 33 s |
| Sous-agent Haiku | 1,19 $ | 132 k | F1 0,98 (±1) | 60 s |

« ±1 » : les sous-agents comptent la ligne vide après le dernier retour à la ligne (21 au lieu de 20).
C'est une convention, pas une erreur.

Consigne non forcée (Claude décide seul), session de 112 k :

| Tâche | Sans consigne | Consigne à chaque message | Consigne une fois au début | Délégué ? |
|---|---|---|---|---|
| T6 | 1,57 $, 190 k | 1,27 $, 132 k | 1,25 et 1,32 $, 133 k | oui (Sonnet ou Haiku) |
| T4 | 1,90 $, 215 k | 1,47 $, 135 k | 1,49 $, 135 k | oui (Sonnet) |
| T1 | environ 1,11 $ | 1,17 $ | 1,15 $ | non |
| T3 | 1,02 $ | 1,02 $ | 1,03 $ | non |

Session légère (35 k), T6 : 0,73 $ et 97 k sans délégation, **0,45 $ et 38 k** avec un sous-agent
Sonnet (deux répétitions identiques). L'économie vient surtout de qui lit les fichiers (Sonnet au lieu
d'Opus), pas seulement de la taille de l'historique : pas de seuil.

Premier essai, sans préciser le modèle (le sous-agent hérite d'Opus) : T1 +12 %, T4 -8 % puis +7 %.
D'où la consigne finale qui nomme Sonnet / Haiku et exclut les tâches courtes.

## Ce qui a été retenu

- Consigne de 90 tokens injectée **une fois** par le hook SessionStart (démarrage, `/clear`,
  compactage ; rien à la reprise d'une session). Aussi efficace qu'une note à chaque message, sans
  s'accumuler dans la conversation.
- Modèle nommé : `sonnet`, `haiku` pour un simple relevé.
- Coupable avec `RELAIS_DELEGUER=0`.

## Limites

- Peu de répétitions (1 à 2 par cas) : des tendances, pas des chiffres exacts.
- Chaque essai inclut environ 0,95 $ fixe dû à la copie de session (son cache est réécrit) ; il est le
  même pour toutes les variantes et n'existe pas dans une vraie session, où l'écart relatif est donc
  plus grand.
- Prix API équivalents ; sur un abonnement, c'est le quota qui est décompté.
- Qualité : sur T4 (revue ouverte), sans délégation Claude a trouvé 0 à 2 textes non traduits, les
  sous-agents 8 à 9. Non tranché. La session principale ne revérifie pas le travail du sous-agent.
- Claude peut mal juger ce qui est « long » ; c'est une consigne, pas une règle imposée.
