# Modèle selon la tâche : mesures (09/10/2026)

Question : quand Claude Code délègue à un sous-agent, quel modèle choisir selon le genre de travail ?
Réponse : Haiku pour les gros relevés (lire beaucoup, rendre des faits), Sonnet pour comprendre ou
coder en volume, personne pour les petites tâches (Opus seul reste le moins cher), et jamais Haiku pour
juger ou écrire pour des humains.

Ce réglage est **désactivé par défaut**. Il s'active dans le tableau de bord (Paramètres, carte
« Modèle selon la tâche ») et ne change que la consigne envoyée au début de chaque session.

## Protocole

- `claude -p` (Claude Code 2.1.291, Opus 5.5 en session principale), `--setting-sources project` pour
  couper les plugins et hooks de l'utilisateur, copie neuve du dépôt pour chaque essai.
- 6 tâches, chacune faite de 4 façons : Opus seul, ou confiée entière à UN sous-agent Haiku, Sonnet
  ou Opus. 2 essais par variante, 48 essais en tout (19,41 $ en prix API).
- Coût tiré de la sortie JSON (`total_cost_usd`, sous-agents compris).
- Qualité notée par script quand c'est possible ; sinon (réflexion, rédaction) par un juge Opus à
  l'aveugle : toutes les réponses d'une tâche mélangées, sans le modèle, notées sur une même grille.

Tâches : relevé = lire 13 scripts et rendre lignes + exports en JSON ; docs = 10 questions précises
dont la réponse est quelque part dans la documentation ; code = petit analyseur écrit d'après une
spécification, tests cachés ; bug = deux bugs injectés dans le tableau, la suite de tests échoue ;
réflexion = idées d'amélioration appuyées sur le code ; rédaction = notes de version pour des
utilisateurs, tirées de messages de commit bruts.

## Résultats

Coût moyen par essai et qualité (moyenne des 2 essais) :

| Tâche | Opus seul | Sous-agent Haiku | Sous-agent Sonnet | Sous-agent Opus |
|---|---|---|---|---|
| Relevé | 0,90 $ · 100 % | **0,34 $ · 100 %** | 0,56 $ · 100 % | 0,86 $ · 100 % |
| Docs | 0,26 $ · 100 % | 0,20 $ · 90 % | 0,26 $ · 95 % | 0,33 $ · 100 % |
| Code | **0,26 $ · 100 %** | 0,42 $ · 100 % | 0,33 $ · 100 % | 0,34 $ · 100 % |
| Bug | **0,19 $ · 100 %** | 0,40 $ · 100 % | 0,22 $ · 100 % | 0,28 $ · 100 % |
| Réflexion | 0,78 $ · 80 % | 0,45 $ · 35 % | 0,50 $ · 75 % | 0,77 $ · 85 % |
| Rédaction | **0,19 $ · 95 %** | 0,17 $ · 45 % | 0,28 $ · 80 % | 0,27 $ · 100 % |

Durée : Haiku est 4 à 5 fois plus lent sur le code et le bug (285 s et 274 s contre 59 s et 56 s
pour Opus seul), et plus cher sur ces deux tâches.

## Ce qu'on en tire

- Gros relevé : -62 % avec Haiku, -38 % avec Sonnet, même résultat. C'est le seul cas où déléguer
  à un petit modèle paie nettement.
- Petite tâche (docs, code, bug, rédaction) : déléguer coûte environ 0,10 $ de pilotage (le chef
  écrit la consigne, relit le résultat). Opus seul reste le moins cher ou presque.
- Réflexion et rédaction : Haiku perd la moitié de la qualité (35 % et 45 %). Sonnet tient mieux
  (75 % et 80 %) mais reste sous Opus.

D'où la consigne envoyée quand le réglage est activé (une fois par session, environ 150 tokens) :
petite tâche, la faire soi-même ; gros volume sans besoin de l'historique, sous-agent `haiku` pour
lire ou relever, `sonnet` pour comprendre ou coder ; juger, décider, concevoir, écrire pour des
humains, soi-même ou `sonnet`, jamais `haiku`.

## Profil du projet

Le tableau compte les appels d'outils de chaque projet sur 30 jours : lecture (Read, Grep, Glob),
code (Edit/Write sur un fichier de code ou de configuration), rédaction (Edit/Write sur md, txt,
docx…), recherche (WebSearch, WebFetch, navigateur). Les commandes (Bash, PowerShell) ne comptent
pas : elles servent à tout. Sous 30 appels, pas de profil ; si aucun genre ne dépasse 45 %, le
profil est « mixte » et n'ajoute rien. Sinon la consigne gagne une ligne, par exemple « Ce projet
(30 derniers jours) : surtout du code (47 % des appels d'outils) : le code volumineux à "sonnet",
les petites modifs toi-même. »

## Ce qui est écrit, et où

- `<dossier de config Claude>/relais/routage.json` : `{ actif, depuis, profils }`. Absent ou
  illisible = désactivé. Les profils (clé = dossier du projet) n'y sont écrits que tant que c'est
  activé, et rafraîchis à chaque mise à jour de l'index du tableau. Désactiver efface les profils.
- Le hook de début de session du plugin relais (`deleguer.mjs`) le lit : désactivé, il envoie la
  consigne de délégation habituelle, inchangée. `RELAIS_DELEGUER=0` coupe les deux.
- Rien ne quitte le PC. La page du tableau ne reçoit que le nom court des projets, jamais leur chemin.

## Limites

- 2 essais par variante : les écarts de quelques points de qualité ne sont pas significatifs, les
  écarts de coût du relevé (x2,6) et de qualité de Haiku en réflexion et rédaction le sont.
- Un seul dépôt (celui de relais), une seule session principale (Opus 5.5). Avec Sonnet en session
  principale, l'intérêt de déléguer à Sonnet disparaît.
- Le profil décrit ce que le projet a fait, pas ce que la prochaine demande sera : ce n'est qu'un
  indice, la consigne générale prime.
