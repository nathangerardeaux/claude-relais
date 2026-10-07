# avocat — un avocat du diable qui vérifie Claude

*[English version](README.md)*

Une coche. Tant qu'elle est active, Claude n'a pas le droit de conclure une réponse avant qu'un agent
indépendant ait essayé de la démonter : faits, chiffres, comportement du code, « c'est corrigé »,
« le test passe », actions faites sur tes fichiers.

## Activer / désactiver

- dans le **tableau relais**, onglet « Avocat du diable » ;
- ou dans Claude Code : `/avocat on`, `/avocat off`, `/avocat` (état) ;
- ou en terminal : `node scripts/basculer.mjs on|off|status`.

Effet immédiat, pas besoin de redémarrer. L'état est dans `~/.claude/avocat/etat.json`.

## Comment ça marche

1. À la fin de chaque réponse, un hook `Stop` lit la coche. Désactivée : il ne fait rien.
2. Activée : il bloque la fin et demande à Claude de lancer l'agent `avocat-du-diable` avec ta demande,
   sa réponse et ses affirmations vérifiables.
3. L'agent (outils **en lecture seule** : Read, Grep, Glob, WebFetch, WebSearch) cherche à réfuter
   chaque affirmation, preuve à l'appui (`fichier:ligne`, URL), et liste les oublis et actions risquées.
4. Claude corrige ce qui est faux, signale ce qui reste douteux et termine par
   « Avocat du diable activé : X confirmé(s), Y corrigé(s), Z douteux (/avocat off pour le couper). »

Pendant la vérification, Claude Code affiche aussi « Avocat du diable activé… » : on sait toujours
pourquoi une réponse consomme plus de tokens.

Garde-fous : jamais de boucle (une réponse n'est vérifiée qu'une fois) ; les réponses courtes sans
action (moins de 200 caractères, aucun fichier modifié, aucune commande) ne sont pas vérifiées
(`AVOCAT_MIN_CAR` pour changer ce seuil) ; si la coche est illisible, elle vaut « désactivée ».

## Coût

Chaque réponse vérifiée = un passage d'agent en plus, donc plus de tokens. À activer pour les sujets
où une erreur coûte cher (sécurité, production, chiffres, cours), puis à décocher.

## Installation

Onglet « Skills » du tableau relais (bouton Installer), ou `/plugin install avocat@claude-relais`.
Redémarre Claude Code ensuite. Tests : `node scripts/tester.mjs`.
