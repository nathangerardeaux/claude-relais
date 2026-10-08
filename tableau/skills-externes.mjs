// External skills and tools (other people's GitHub repos) shown in the Skills tab, sorted by category.
// Every card follows the SAME template, in French AND English (the dashboard shows the system language:
// French on a French PC, English everywhere else). tester.mjs refuses a card that misses a field.
//
//   TEMPLATE OF A CARD (copy the last card, change everything):
//   id, nom, depot ('owner/repo'), categorie (one of CATEGORIES), etoiles (GitHub stars on `releve`),
//   licence, action (what the Install button does, see gestion.mjs), cout ({ jetons, note }: always-on
//   tokens measured with `claude plugin details`, null when it is not a plugin), and in { fr, en }:
//     type          what it is, in a few words
//     resume        one sentence: what it is for
//     schema        3 to 6 short steps "how it works", drawn as boxes with arrows
//     description   2 or 3 paragraphs: what it does in detail
//     contenu       [name, what it does] pairs: what is inside
//     installation  [label, command] pairs (manual method, the button does it for you)
//     utilisation   how to use it day to day (concrete prompts)
//     attention     the trap to know before installing
//   OPTIONAL (both in { fr, en } where there is text):
//     demo          { video: '/demo/<name>.mp4' (a route of MEDIAS in serveur.mjs), legende } : "Watch the demo" button
//     prompt        { texte, conseil } : "The prompt that works" block with a copy button, and one line of advice
//
// Stars and costs are snapshots (no network call). To add a card: append one, then restart the dashboard.

export const releve = '2026-10-06';

// Folder names of VoltAgent/awesome-design-md/design-md/ (snapshot): the only styles the dashboard downloads.
export const STYLES_DESIGN = [
  'airbnb', 'airtable', 'apple', 'binance', 'bmw-m', 'bmw', 'bugatti', 'cal', 'claude', 'clay', 'clickhouse',
  'cohere', 'coinbase', 'composio', 'cursor', 'dell-1996', 'elevenlabs', 'expo', 'ferrari', 'figma',
  'framer', 'hashicorp', 'hp', 'ibm', 'intercom', 'kraken', 'lamborghini', 'linear.app', 'lovable',
  'mastercard', 'meta', 'minimax', 'mintlify', 'miro', 'mistral.ai', 'mongodb', 'nike', 'nintendo-2001',
  'notion', 'nvidia', 'ollama', 'opencode.ai', 'pinterest', 'playstation', 'posthog', 'raycast', 'renault',
  'replicate', 'resend', 'revolut', 'runwayml', 'sanity', 'sentry', 'shopify', 'slack', 'spacex', 'spotify',
  'starbucks', 'stripe', 'supabase', 'superhuman', 'tesla', 'theverge', 'together.ai', 'uber', 'vercel',
  'vodafone', 'voltagent', 'warp', 'webflow', 'wired', 'wise', 'x.ai', 'zapier',
];

export const CATEGORIES = [
  {
    id: 'methode',
    nom: { fr: 'Méthode & productivité', en: 'Workflow & productivity' },
    description: {
      fr: 'Des façons de travailler toutes prêtes pour l\'agent : planifier, tester, relire, se souvenir.',
      en: 'Ready-made ways of working for the agent: plan, test, review, remember.',
    },
  },
  {
    id: 'design',
    nom: { fr: 'Design & interface', en: 'Design & UI' },
    description: {
      fr: 'Pour que les pages générées par l\'IA aient une vraie direction artistique au lieu du rendu « générique ».',
      en: 'So that AI-built pages get a real art direction instead of the "generic" look.',
    },
  },
  {
    id: 'code',
    nom: { fr: 'Comprendre le code', en: 'Understanding code' },
    description: {
      fr: 'Pour que l\'agent trouve qui appelle quoi dans un gros projet sans relire des dizaines de fichiers.',
      en: 'So that the agent finds what calls what in a big project without re-reading dozens of files.',
    },
  },
  {
    id: 'deploiement',
    nom: { fr: 'Déploiement & hébergement', en: 'Deployment & hosting' },
    description: {
      fr: 'Pour mettre un site en ligne et le gérer depuis le terminal.',
      en: 'To put a site online and manage it from the terminal.',
    },
  },
  {
    id: 'video',
    nom: { fr: 'Vidéo & animation', en: 'Video & animation' },
    description: {
      fr: 'Pour que l\'agent fabrique de vraies vidéos (présentation, démo, réseaux) en écrivant du code.',
      en: 'So that the agent makes real videos (overview, demo, social) by writing code.',
    },
  },
];

export const SKILLS_EXTERNES = [
  {
    id: 'ecc',
    nom: 'ECC (Everything Claude Code)',
    depot: 'affaan-m/ECC',
    categorie: 'methode',
    etoiles: 273805,
    licence: 'MIT',
    action: { type: 'plugin', marketplace: 'affaan-m/ECC', plugin: 'ecc@ecc', coupePartout: true },
    cout: {
      jetons: 31478,
      note: {
        fr: 'Mesuré le 6 octobre 2026 : ~31 500 jetons ajoutés à CHAQUE conversation où il est actif, soit environ 20 fois tous tes plugins actuels réunis. Ses hooks ajoutent en plus du contexte au démarrage.',
        en: 'Measured on 6 October 2026: ~31,500 tokens added to EVERY conversation where it is on, about 20 times all your current plugins together. Its hooks also add context at startup.',
      },
    },
    type: { fr: 'Plugin Claude Code géant (387 skills, 68 agents, hooks)', en: 'Huge Claude Code plugin (387 skills, 68 agents, hooks)' },
    resume: {
      fr: 'Un « système d\'exploitation » complet pour l\'agent : il planifie avant de coder, écrit les tests d\'abord, se fait relire par un agent neuf, vérifie, puis retient ce qui compte d\'une session à l\'autre.',
      en: 'A complete "operating system" for the agent: it plans before coding, writes tests first, gets reviewed by a fresh agent, verifies, then remembers what matters from one session to the next.',
    },
    schema: {
      fr: ['Planifier (/ecc:plan)', 'Tests d\'abord (tdd-workflow)', 'Coder jusqu\'au vert', 'Relecture par un agent neuf (/code-review)', 'Vérifier : build, lint, tests', 'Retenir (/save-session)'],
      en: ['Plan (/ecc:plan)', 'Tests first (tdd-workflow)', 'Code until green', 'Fresh-agent review (/code-review)', 'Verify: build, lint, tests', 'Remember (/save-session)'],
    },
    description: {
      fr: [
        'ECC (Everything Claude Code) est le pack le plus étoilé de l\'écosystème. Au lieu de redemander à chaque prompt « fais un plan, teste, relis-toi », il installe cette méthode une fois pour toutes : plan → test → code → relecture → vérification → mémoire → amélioration. Sa devise : « optimise la fenêtre de contexte, garde tout le reste ailleurs ».',
        'Il contient 68 agents spécialisés (planner, architect, code-reviewer, security-reviewer, build-error-resolver, un relecteur par langage : TypeScript, Python, Go, Rust, PHP…), environ 390 skills (TDD, recherche, sécurité, docs, front, data, ML, opérations, et beaucoup de métiers très spécialisés), des hooks qui font respecter des contrôles automatiques, une mémoire de session (résumés, « instincts » appris avec un score de confiance) et AgentShield, un scanner qui audite la config de l\'agent elle-même (prompts, hooks, MCP, permissions, secrets).',
        'Il marche avec Claude Code, et aussi Codex, Cursor, OpenCode, Gemini, Zed, Copilot et d\'autres. Gros revers : tout charger d\'un coup coûte très cher en jetons. Il vaut mieux l\'allumer seulement là où tu veux cette méthode, ou n\'installer que quelques skills à la main.',
      ],
      en: [
        'ECC (Everything Claude Code) is the most-starred pack of the ecosystem. Instead of asking "make a plan, test, review yourself" in every prompt, it installs that method once and for all: plan → test → implement → review → verify → remember → improve. Its motto: "optimise the context window, persist everything else".',
        'It holds 68 specialised agents (planner, architect, code-reviewer, security-reviewer, build-error-resolver, one reviewer per language: TypeScript, Python, Go, Rust, PHP…), about 390 skills (TDD, research, security, docs, frontend, data, ML, operations, and many very specialised domains), hooks that enforce automatic checks, session memory (summaries, learned "instincts" with a confidence score) and AgentShield, a scanner that audits the agent configuration itself (prompts, hooks, MCP, permissions, secrets).',
        'It works with Claude Code, and also Codex, Cursor, OpenCode, Gemini, Zed, Copilot and others. Big downside: loading everything at once is very expensive in tokens. Better switch it on only where you want this method, or install just a few skills by hand.',
      ],
    },
    contenu: {
      fr: [
        ['/ecc:plan "…"', 'L\'agent planner écrit un plan d\'implémentation modifiable avant de coder.'],
        ['tdd-workflow', 'Tests d\'abord : test qui échoue (rouge), code minimal (vert), nettoyage, preuve à chaque étape.'],
        ['/code-review', 'Relecture par un agent au contexte neuf, qui cherche régressions et angles morts.'],
        ['/build-fix', 'Répare un build cassé (agent build-error-resolver).'],
        ['/security-scan', 'Cherche les failles de sécurité (agent security-reviewer, AgentShield).'],
        ['/refactor-clean', 'Supprime le code mort et nettoie.'],
        ['/context-budget', 'Montre la pression sur la fenêtre de contexte.'],
        ['/save-session, /resume-session', 'Résumer une longue session et la reprendre plus tard.'],
        ['Relecteurs par langage', 'typescript-reviewer, python-reviewer, go-reviewer, rust-reviewer, php-reviewer…'],
        ['Hooks', '7 événements (avant/après chaque outil, démarrage, fin…) pour des contrôles automatiques.'],
      ],
      en: [
        ['/ecc:plan "…"', 'The planner agent writes an editable implementation plan before any code.'],
        ['tdd-workflow', 'Tests first: failing test (red), minimal code (green), cleanup, evidence at each step.'],
        ['/code-review', 'Review by a fresh-context agent looking for regressions and blind spots.'],
        ['/build-fix', 'Repairs a broken build (build-error-resolver agent).'],
        ['/security-scan', 'Looks for security flaws (security-reviewer agent, AgentShield).'],
        ['/refactor-clean', 'Removes dead code and cleans up.'],
        ['/context-budget', 'Shows the pressure on the context window.'],
        ['/save-session, /resume-session', 'Summarise a long session and pick it up later.'],
        ['Per-language reviewers', 'typescript-reviewer, python-reviewer, go-reviewer, rust-reviewer, php-reviewer…'],
        ['Hooks', '7 events (before/after each tool, startup, end…) for automatic checks.'],
      ],
    },
    installation: {
      fr: [
        ['Dans Claude Code (marketplace)', '/plugin marketplace add https://github.com/affaan-m/ECC'],
        ['puis', '/plugin install ecc@ecc'],
        ['Ou l\'installateur guidé (Node.js 18+)', 'npx ecc-universal@2.2.3 setup'],
        ['Version légère sans hooks (règles, agents, commandes)', 'npx ecc-universal@2.2.3 install --profile minimal --target claude'],
      ],
      en: [
        ['In Claude Code (marketplace)', '/plugin marketplace add https://github.com/affaan-m/ECC'],
        ['then', '/plugin install ecc@ecc'],
        ['Or the guided installer (Node.js 18+)', 'npx ecc-universal@2.2.3 setup'],
        ['Light version without hooks (rules, agents, commands)', 'npx ecc-universal@2.2.3 install --profile minimal --target claude'],
      ],
    },
    utilisation: {
      fr: [
        'Le bouton Installer l\'installe puis le COUPE partout aussitôt : allume-le ensuite dans « Gestion des skills », pour un seul projet ou dans un profil de conversation.',
        'Nouvelle fonctionnalité : « /ecc:plan "ajoute la connexion OAuth" », valide le plan, puis « utilise tdd-workflow ».',
        'Bug : demande d\'abord un test qui reproduit le bug, puis « utilise tdd-workflow » pour le corriger.',
        'Avant de livrer : « /code-review » puis « /security-scan ».',
        'Fin de longue session : « /save-session », puis « /resume-session » la fois suivante.',
      ],
      en: [
        'The Install button installs it then switches it OFF everywhere right away: turn it on afterwards in "Skill management", for one project or in a conversation profile.',
        'New feature: "/ecc:plan "add OAuth login"", approve the plan, then "use tdd-workflow".',
        'Bug: first ask for a test that reproduces it, then "use tdd-workflow" to fix it.',
        'Before shipping: "/code-review" then "/security-scan".',
        'End of a long session: "/save-session", then "/resume-session" next time.',
      ],
    },
    attention: {
      fr: 'Très gourmand (~31 500 jetons par conversation) : ne l\'allume jamais partout. N\'empile pas deux méthodes d\'installation (doublons de skills et de hooks). Certains skills font doublon avec ce que tu as déjà (hookify, code-review), et ses hooks de démarrage s\'ajoutent à ceux du relais.',
      en: 'Very hungry (~31,500 tokens per conversation): never switch it on everywhere. Do not stack two install methods (duplicate skills and hooks). Some skills duplicate what you already have (hookify, code-review), and its startup hooks add to the relais ones.',
    },
  },
  {
    id: 'taste-skill',
    nom: 'Taste Skill',
    depot: 'Leonxlnx/taste-skill',
    categorie: 'design',
    etoiles: 92739,
    licence: 'MIT',
    action: { type: 'plugin', marketplace: 'Leonxlnx/taste-skill', plugin: 'taste-skill@taste-skill' },
    cout: {
      jetons: 1699,
      note: {
        fr: 'Mesuré sur ton PC : ~1 700 jetons par conversation où il est actif.',
        en: 'Measured on this PC: ~1,700 tokens per conversation where it is on.',
      },
    },
    type: { fr: 'Plugin Claude Code (13 skills)', en: 'Claude Code plugin (13 skills)' },
    resume: {
      fr: 'Donne du « goût » à l\'IA pour le front-end : mise en page, typo, animations et espacements soignés au lieu des interfaces passe-partout.',
      en: 'Gives the AI "taste" for frontend work: polished layout, type, motion and spacing instead of one-size-fits-all interfaces.',
    },
    schema: {
      fr: ['Tu demandes une page ou un composant', 'Le skill lit le brief et choisit un langage visuel', 'Il règle 3 curseurs : variété, animation, densité', 'Il code l\'interface', 'Contrôle final anti-« générique »'],
      en: ['You ask for a page or a component', 'The skill reads the brief and picks a visual language', 'It sets 3 dials: variance, motion, density', 'It codes the interface', 'Final anti-"generic" check'],
    },
    description: {
      fr: [
        'Une bibliothèque de skills « anti-slop » pour les interfaces web. Le skill principal (design-taste-frontend, v2 expérimentale) lit ta demande, en déduit un langage visuel, puis règle trois curseurs de 1 à 10 écrits en tête du fichier : DESIGN_VARIANCE (mise en page sage ou asymétrique), MOTION_INTENSITY (simple survol ou animations au défilement) et VISUAL_DENSITY (aéré ou dense type tableau de bord). Il impose une vérification avant livraison et interdit les tics typiques de l\'IA.',
        'Les autres skills font chacun un seul travail : refaire un projet existant, imposer un style précis (minimaliste, brutaliste, haut de gamme), forcer l\'IA à rendre du code complet, ou générer des images de maquettes à transformer ensuite en code.',
      ],
      en: [
        'A library of "anti-slop" skills for web interfaces. The main skill (design-taste-frontend, experimental v2) reads your request, infers a visual language, then sets three 1-to-10 dials written at the top of the file: DESIGN_VARIANCE (calm or asymmetric layout), MOTION_INTENSITY (simple hover or scroll animations) and VISUAL_DENSITY (airy or dashboard-dense). It enforces a check before delivery and bans typical AI tics.',
        'The other skills each do one job: rework an existing project, impose a precise style (minimalist, brutalist, high-end), force the AI to output complete code, or generate mockup images to turn into code afterwards.',
      ],
    },
    contenu: {
      fr: [
        ['design-taste-frontend', 'Le skill par défaut (v2) : déduit le style, règle les 3 curseurs, contrôle final. Commence par celui-là.'],
        ['design-taste-frontend-v1', 'L\'ancienne v1, seulement si la v2 casse quelque chose chez toi.'],
        ['redesign-existing-projects', 'Projet existant : audite l\'interface puis corrige mise en page, espacements, hiérarchie.'],
        ['high-end-visual-design', 'Rendu calme et « cher » : contrastes doux, beaucoup d\'air, polices premium.'],
        ['minimalist-ui', 'Style éditorial à la Notion / Linear, palette sobre.'],
        ['industrial-brutalist-ui', 'Style brut et mécanique : typo suisse, forts contrastes.'],
        ['full-output-enforcement', 'Quand l\'IA rend du travail à moitié fini : code complet, pas de « ... reste du code ».'],
        ['image-to-code', 'Génère des maquettes en image, les analyse, puis code le site pour les reproduire.'],
        ['stitch-design-taste', 'Règles compatibles Google Stitch, avec export DESIGN.md.'],
        ['gpt-taste', 'Variante plus stricte pensée pour GPT / Codex.'],
        ['imagegen-frontend-web / -mobile / brandkit', 'Produisent seulement des images (maquettes web, écrans mobiles, planches de marque), pas de code.'],
      ],
      en: [
        ['design-taste-frontend', 'The default skill (v2): infers the style, sets the 3 dials, final check. Start with this one.'],
        ['design-taste-frontend-v1', 'The old v1, only if v2 breaks something for you.'],
        ['redesign-existing-projects', 'Existing project: audits the interface then fixes layout, spacing, hierarchy.'],
        ['high-end-visual-design', 'Calm, "expensive" look: soft contrast, lots of whitespace, premium fonts.'],
        ['minimalist-ui', 'Editorial Notion / Linear style, restrained palette.'],
        ['industrial-brutalist-ui', 'Raw, mechanical style: Swiss type, strong contrast.'],
        ['full-output-enforcement', 'When the AI ships half-finished work: complete code, no "... rest of the code".'],
        ['image-to-code', 'Generates mockup images, analyses them, then codes the site to match.'],
        ['stitch-design-taste', 'Google Stitch-compatible rules, with DESIGN.md export.'],
        ['gpt-taste', 'Stricter variant designed for GPT / Codex.'],
        ['imagegen-frontend-web / -mobile / brandkit', 'Produce images only (web comps, mobile screens, brand boards), no code.'],
      ],
    },
    installation: {
      fr: [
        ['Dans Claude Code (marketplace, recommandé)', '/plugin marketplace add Leonxlnx/taste-skill'],
        ['puis', '/plugin install taste-skill@taste-skill'],
        ['Ou avec le CLI skills (tous les skills)', 'npx skills add https://github.com/Leonxlnx/taste-skill'],
        ['Ou un seul skill', 'npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend"'],
      ],
      en: [
        ['In Claude Code (marketplace, recommended)', '/plugin marketplace add Leonxlnx/taste-skill'],
        ['then', '/plugin install taste-skill@taste-skill'],
        ['Or with the skills CLI (all skills)', 'npx skills add https://github.com/Leonxlnx/taste-skill'],
        ['Or a single skill', 'npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend"'],
      ],
    },
    utilisation: {
      fr: [
        'Redémarre Claude Code après l\'installation : les skills se déclenchent tout seuls dès que tu demandes une page, un composant ou une refonte.',
        'Pour forcer un skill, nomme-le : « utilise le skill design-taste-frontend pour faire la page d\'accueil ».',
        'Sur un site déjà fait : « utilise redesign-existing-projects pour auditer puis améliorer cette page ».',
        'Choisis UN style à la fois (minimalist-ui, high-end-visual-design ou industrial-brutalist-ui) en plus du skill par défaut.',
        'Pour image-to-code, annonce le déroulé : « suis le skill : génère les images, analyse-les, puis code ».',
      ],
      en: [
        'Restart Claude Code after installing: the skills kick in by themselves as soon as you ask for a page, a component or a redesign.',
        'To force a skill, name it: "use the design-taste-frontend skill to build the home page".',
        'On an existing site: "use redesign-existing-projects to audit then improve this page".',
        'Pick ONE style at a time (minimalist-ui, high-end-visual-design or industrial-brutalist-ui) on top of the default skill.',
        'For image-to-code, state the pipeline: "follow the skill: generate the images, analyse them, then code".',
      ],
    },
    attention: {
      fr: 'La v2 du skill principal est marquée « expérimentale » par l\'auteur. Il interdit le tiret cadratin, comme tes propres règles.',
      en: 'The author marks the main skill\'s v2 as "experimental". It bans the em dash.',
    },
  },
  {
    id: 'awesome-design-md',
    nom: 'Awesome DESIGN.md',
    depot: 'VoltAgent/awesome-design-md',
    categorie: 'design',
    etoiles: 119623,
    licence: 'MIT',
    action: { type: 'design-md' },
    cout: {
      jetons: null,
      note: {
        fr: 'Rien de permanent : un DESIGN.md (~10 000 jetons) n\'est lu que quand Claude travaille l\'interface du projet.',
        en: 'Nothing permanent: a DESIGN.md (~10,000 tokens) is only read when Claude works on the project\'s interface.',
      },
    },
    type: { fr: 'Collection de fichiers DESIGN.md (pas un plugin)', en: 'Collection of DESIGN.md files (not a plugin)' },
    resume: {
      fr: 'Plus de 70 chartes graphiques prêtes à l\'emploi (Vercel, Linear, Notion, Stripe, Apple...) : tu en poses une dans ton projet et l\'IA construit une interface dans ce style.',
      en: 'Over 70 ready-to-use design systems (Vercel, Linear, Notion, Stripe, Apple...): drop one into your project and the AI builds an interface in that style.',
    },
    schema: {
      fr: ['Tu choisis un style parmi 74', 'DESIGN.md posé à la racine du projet', 'Claude lit couleurs, typo et composants', 'Interface fidèle à la charte'],
      en: ['You pick one of 74 styles', 'DESIGN.md dropped at the project root', 'Claude reads colours, type and components', 'Interface true to the design system'],
    },
    description: {
      fr: [
        'DESIGN.md est un format lancé par Google Stitch : un simple fichier texte qui décrit à l\'IA à quoi doit ressembler l\'interface (là où AGENTS.md / CLAUDE.md décrit comment construire le projet). Pas d\'export Figma, pas de configuration : l\'agent lit le fichier et s\'y tient.',
        'Ce dépôt en fournit 74, analysés à partir de vrais sites et rangés par familles (IA, outils de dev, backend, SaaS, création, fintech, e-commerce, médias, automobile, web rétro des années 90). Chaque fichier contient : ambiance, palette avec codes hex et rôle de chaque couleur, hiérarchie typographique, style des composants (boutons, cartes, champs, navigation) avec leurs états, grille et espacements, ombres, à faire / à ne pas faire, comportement responsive et des prompts prêts à l\'emploi.',
      ],
      en: [
        'DESIGN.md is a format introduced by Google Stitch: a plain text file telling the AI what the interface should look like (where AGENTS.md / CLAUDE.md tells it how to build the project). No Figma export, no configuration: the agent reads the file and sticks to it.',
        'This repo provides 74 of them, analysed from real websites and grouped by family (AI, dev tools, backend, SaaS, creative, fintech, e-commerce, media, automotive, 1990s retro web). Each file holds: mood, palette with hex codes and the role of each colour, type hierarchy, component styles (buttons, cards, inputs, navigation) with their states, grid and spacing, shadows, do\'s and don\'ts, responsive behaviour and ready-to-use prompts.',
      ],
    },
    contenu: {
      fr: [
        ['IA & LLM', 'Claude, Mistral AI, ElevenLabs, Ollama, Replicate, xAI...'],
        ['Outils de dev', 'Cursor, Vercel, Raycast, Warp, Linear, Expo...'],
        ['Backend & DevOps', 'Supabase, MongoDB, Sentry, PostHog, ClickHouse...'],
        ['SaaS, fintech, e-commerce, médias, auto', 'Notion, Stripe, Airbnb, Apple, Ferrari, BMW...'],
        ['Web rétro', 'Des sites des années 90 pour une interface d\'époque.'],
        ['Aperçus', 'Sur getdesign.md : couleurs, typo, boutons et cartes en clair et en sombre.'],
      ],
      en: [
        ['AI & LLM', 'Claude, Mistral AI, ElevenLabs, Ollama, Replicate, xAI...'],
        ['Dev tools', 'Cursor, Vercel, Raycast, Warp, Linear, Expo...'],
        ['Backend & DevOps', 'Supabase, MongoDB, Sentry, PostHog, ClickHouse...'],
        ['SaaS, fintech, e-commerce, media, auto', 'Notion, Stripe, Airbnb, Apple, Ferrari, BMW...'],
        ['Retro web', '1990s websites for a period-accurate interface.'],
        ['Previews', 'On getdesign.md: colours, type, buttons and cards in light and dark.'],
      ],
    },
    installation: {
      fr: [
        ['Rien à installer. Choisis un style sur', 'https://getdesign.md'],
        ['Puis télécharge son DESIGN.md à la racine du projet (PowerShell, exemple : Vercel)', 'iwr https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/vercel/DESIGN.md -OutFile DESIGN.md'],
      ],
      en: [
        ['Nothing to install. Pick a style on', 'https://getdesign.md'],
        ['Then download its DESIGN.md to the project root (PowerShell, example: Vercel)', 'iwr https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/vercel/DESIGN.md -OutFile DESIGN.md'],
      ],
    },
    utilisation: {
      fr: [
        'Choisis le style et le projet ci-dessus puis « Ajouter au projet » (à la main : remplace « vercel » dans l\'adresse par le style voulu).',
        'Le fichier doit s\'appeler DESIGN.md et être à la racine du projet.',
        'Dis à Claude : « construis cette page en suivant DESIGN.md » ; ajoute dans ton CLAUDE.md « respecte DESIGN.md pour toute interface » pour que ce soit automatique.',
        'Se combine très bien avec Taste Skill : DESIGN.md donne la charte, Taste Skill la qualité d\'exécution.',
      ],
      en: [
        'Pick the style and the project above, then "Add to project" (by hand: replace "vercel" in the address with the style you want).',
        'The file must be named DESIGN.md and sit at the project root.',
        'Tell Claude: "build this page following DESIGN.md"; add "follow DESIGN.md for any interface" to your CLAUDE.md to make it automatic.',
        'Pairs very well with Taste Skill: DESIGN.md gives the design system, Taste Skill the execution quality.',
      ],
    },
    attention: {
      fr: 'Ce sont des interprétations « inspirées de » ces marques : bien pour prototyper ou s\'inspirer, mais ne copie pas l\'identité d\'une marque sur un site client (logo, couleurs signature).',
      en: 'These are interpretations "inspired by" those brands: fine to prototype or get inspired, but do not copy a brand\'s identity onto a client site (logo, signature colours).',
    },
  },
  {
    id: 'vercel',
    nom: 'Vercel CLI',
    depot: 'vercel/vercel',
    categorie: 'deploiement',
    etoiles: 16341,
    licence: 'Apache-2.0',
    action: { type: 'npm', paquet: 'vercel', ensuite: { fr: 'tape « vercel login » dans un terminal pour te connecter.', en: 'type "vercel login" in a terminal to sign in.' } },
    cout: {
      jetons: null,
      note: {
        fr: 'Aucun : ce n\'est pas un plugin, Claude ne le paie que quand il lance la commande.',
        en: 'None: it is not a plugin, Claude only pays when it runs the command.',
      },
    },
    type: { fr: 'Outil en ligne de commande (pas un skill)', en: 'Command-line tool (not a skill)' },
    resume: {
      fr: 'Le dépôt officiel de Vercel : son outil en ligne de commande pour déployer un site (Next.js, React, statique...) en une commande, avec une adresse d\'aperçu par déploiement.',
      en: 'Vercel\'s official repo: its command-line tool to deploy a site (Next.js, React, static...) in one command, with a preview address for each deployment.',
    },
    schema: {
      fr: ['Dossier du site', '« vercel »', 'Adresse d\'aperçu', 'Tu vérifies', '« vercel --prod » avec ton feu vert'],
      en: ['Site folder', '"vercel"', 'Preview address', 'You check it', '"vercel --prod" once you approve'],
    },
    description: {
      fr: [
        'Ce n\'est pas un skill Claude Code : c\'est le code source de la commande « vercel ». Elle relie un dossier à un projet Vercel, envoie le site et renvoie une adresse d\'aperçu (preview) à chaque déploiement, ou met en production. Elle gère aussi les variables d\'environnement, les domaines, les logs et lance le site en local comme sur Vercel.',
        'Point utile pour les skills : la commande « vercel skills » cherche des skills d\'agent adaptés à ton projet (dans l\'annuaire skills.sh) et peut les installer pour toi via « npx skills ». Claude Code sait piloter cette commande tout seul dès qu\'elle est installée.',
      ],
      en: [
        'This is not a Claude Code skill: it is the source code of the "vercel" command. It links a folder to a Vercel project, uploads the site and returns a preview address for each deployment, or ships to production. It also handles environment variables, domains, logs, and runs the site locally just like on Vercel.',
        'Useful for skills: the "vercel skills" command looks for agent skills suited to your project (in the skills.sh directory) and can install them for you through "npx skills". Claude Code can drive this command by itself once it is installed.',
      ],
    },
    contenu: {
      fr: [
        ['vercel', 'Déploie le dossier courant en aperçu (adresse temporaire).'],
        ['vercel --prod', 'Déploie en production.'],
        ['vercel dev', 'Lance le site en local avec le même comportement que sur Vercel.'],
        ['vercel env pull', 'Récupère les variables d\'environnement dans un .env local.'],
        ['vercel logs / domains', 'Lire les journaux, gérer les noms de domaine.'],
        ['vercel skills [mot-clé]', 'Recommande des skills d\'agent pour le projet détecté, ou cherche par mot-clé (ex. nextjs).'],
      ],
      en: [
        ['vercel', 'Deploys the current folder as a preview (temporary address).'],
        ['vercel --prod', 'Deploys to production.'],
        ['vercel dev', 'Runs the site locally with the same behaviour as on Vercel.'],
        ['vercel env pull', 'Fetches environment variables into a local .env.'],
        ['vercel logs / domains', 'Read logs, manage domain names.'],
        ['vercel skills [keyword]', 'Recommends agent skills for the detected project, or searches by keyword (e.g. nextjs).'],
      ],
    },
    installation: {
      fr: [
        ['Installer la commande (Node.js requis)', 'npm i -g vercel'],
        ['Se connecter à son compte Vercel', 'vercel login'],
      ],
      en: [
        ['Install the command (Node.js required)', 'npm i -g vercel'],
        ['Sign in to your Vercel account', 'vercel login'],
      ],
    },
    utilisation: {
      fr: [
        'Dans le dossier du site : « vercel » pour un aperçu, que tu peux ouvrir et vérifier avant toute mise en ligne.',
        'Demande à Claude : « déploie un aperçu sur Vercel et donne-moi l\'adresse ».',
        '« vercel skills » dans un projet pour découvrir des skills adaptés à sa techno.',
      ],
      en: [
        'In the site folder: "vercel" for a preview you can open and check before anything goes live.',
        'Ask Claude: "deploy a preview on Vercel and give me the address".',
        '"vercel skills" in a project to discover skills suited to its stack.',
      ],
    },
    attention: {
      fr: '« vercel --prod » met le site en production : jamais sans ton feu vert. Un compte Vercel est nécessaire.',
      en: '"vercel --prod" puts the site in production: never without your approval. A Vercel account is required.',
    },
  },
  {
    id: 'graphify',
    nom: 'Graphify',
    depot: 'Graphify-Labs/graphify',
    categorie: 'code',
    etoiles: 124146,
    licence: 'Apache-2.0',
    action: {
      type: 'uv', paquet: 'graphifyy',
      ensuite: {
        fr: 'dans le dossier d\'un projet, tape « graphify extract . --code-only » (local, sans IA), puis ajoute graphify-out/ à son .gitignore.',
        en: 'in a project folder, type "graphify extract . --code-only" (local, no AI), then add graphify-out/ to its .gitignore.',
      },
    },
    cout: {
      jetons: null,
      note: {
        fr: 'Aucun tant que tu installes seulement la commande (ce que fait le bouton) : Claude ne paie que la réponse d\'un « graphify query ». Si tu lances en plus « graphify install », son skill de 43 Ko (environ 11 000 tokens) se charge dès qu\'une question parle de code.',
        en: 'None as long as you only install the command (what the button does): Claude only pays for the answer of a "graphify query". If you also run "graphify install", its 43 KB skill (about 11,000 tokens) loads whenever a question is about code.',
      },
    },
    type: { fr: 'Outil en ligne de commande Python (+ skill facultatif)', en: 'Python command-line tool (+ optional skill)' },
    resume: {
      fr: 'Transforme un projet en graphe de connaissances (qui appelle quoi, qui importe quoi, quels groupes de fichiers vont ensemble) que l\'agent interroge au lieu de lire les fichiers un par un.',
      en: 'Turns a project into a knowledge graph (what calls what, what imports what, which files belong together) that the agent queries instead of reading files one by one.',
    },
    schema: {
      fr: ['Ton projet', '« graphify extract . --code-only »', 'graphify-out/ : graphe + rapport', '« graphify query "…" »', 'Claude lit 1 réponse au lieu de 20 fichiers'],
      en: ['Your project', '"graphify extract . --code-only"', 'graphify-out/: graph + report', '"graphify query "…""', 'Claude reads 1 answer instead of 20 files'],
    },
    description: {
      fr: [
        'Graphify lit le code avec tree-sitter (37 langages, dont JavaScript, PHP, Python, Lua et Luau) et en tire un graphe : fonctions, classes, appels, imports, héritages, reliés d\'un fichier à l\'autre. Il regroupe ensuite les fichiers en « communautés » (les sous-systèmes du projet) et écrit trois fichiers dans graphify-out/ : graph.json (le graphe), GRAPH_REPORT.md (un résumé lisible) et graph.html (une carte interactive). Pour le code, tout se fait en local, sans IA et sans réseau.',
        'Ensuite, au lieu de chercher avec grep puis d\'ouvrir dix fichiers, l\'agent demande « graphify query "qu\'est-ce qui relie l\'authentification à la base ?" » et reçoit seulement les nœuds et liens utiles. Chaque lien dit s\'il a été lu dans le code (EXTRACTED) ou deviné (INFERRED).',
        'Les documents, PDF et images passent eux par un modèle d\'IA (tes tokens ou une clé d\'API) : l\'option --code-only les ignore. Le gain est réel sur un gros projet qu\'on connaît mal ; sur un petit projet ou un projet déjà bien documenté pour l\'agent, il est faible.',
      ],
      en: [
        'Graphify reads code with tree-sitter (37 languages, including JavaScript, PHP, Python, Lua and Luau) and builds a graph from it: functions, classes, calls, imports, inheritance, linked across files. It then groups files into "communities" (the project\'s subsystems) and writes three files in graphify-out/: graph.json (the graph), GRAPH_REPORT.md (a readable summary) and graph.html (an interactive map). For code, everything runs locally, with no AI and no network.',
        'Then, instead of searching with grep and opening ten files, the agent asks "graphify query "what connects auth to the database?"" and only gets the useful nodes and links. Every link says whether it was read in the code (EXTRACTED) or guessed (INFERRED).',
        'Documents, PDFs and images go through an AI model (your tokens or an API key): the --code-only option skips them. The gain is real on a big project you know little about; on a small project, or one already well documented for the agent, it is small.',
      ],
    },
    contenu: {
      fr: [
        ['graphify extract . --code-only', 'Construit le graphe du code, en local, sans IA (ignore docs, PDF et images).'],
        ['graphify update .', 'Remet le graphe à jour avec les fichiers modifiés (après un git pull ou de grosses modifs).'],
        ['graphify query "<question>"', 'Répond à une question sur le code à partir du graphe.'],
        ['graphify path A B / explain X', 'Le chemin entre deux éléments du code, ou tout ce qui touche un élément.'],
        ['graphify-out/', 'graph.json, GRAPH_REPORT.md et graph.html (carte interactive à ouvrir dans le navigateur).'],
        ['graphify install (facultatif)', 'Ajoute le skill /graphify ET un bloc dans ton CLAUDE.md global : à éviter, voir « Attention ».'],
      ],
      en: [
        ['graphify extract . --code-only', 'Builds the code graph locally, with no AI (skips docs, PDFs and images).'],
        ['graphify update .', 'Brings the graph up to date with changed files (after a git pull or big edits).'],
        ['graphify query "<question>"', 'Answers a question about the code from the graph.'],
        ['graphify path A B / explain X', 'The path between two code elements, or everything that touches one element.'],
        ['graphify-out/', 'graph.json, GRAPH_REPORT.md and graph.html (interactive map to open in the browser).'],
        ['graphify install (optional)', 'Adds the /graphify skill AND a block in your global CLAUDE.md: best avoided, see "Watch out".'],
      ],
    },
    installation: {
      fr: [
        ['Installer la commande (Python 3.10+ et uv requis ; le paquet a deux y)', 'uv tool install graphifyy'],
        ['Construire le graphe dans le dossier du projet', 'graphify extract . --code-only'],
        ['Interroger le graphe', 'graphify query "<question>"'],
      ],
      en: [
        ['Install the command (Python 3.10+ and uv required; the package has two y\'s)', 'uv tool install graphifyy'],
        ['Build the graph in the project folder', 'graphify extract . --code-only'],
        ['Query the graph', 'graphify query "<question>"'],
      ],
    },
    utilisation: {
      fr: [
        'Une fois par projet : « graphify extract . --code-only », puis ouvre graphify-out/graph.html pour voir la carte.',
        'Demande à Claude : « utilise graphify query pour trouver ce qui appelle la fonction de paiement, avant d\'ouvrir des fichiers ».',
        'Après un git pull ou une grosse série de modifs : « graphify update . », sinon le graphe décrit l\'ancien code.',
      ],
      en: [
        'Once per project: "graphify extract . --code-only", then open graphify-out/graph.html to see the map.',
        'Ask Claude: "use graphify query to find what calls the payment function, before opening files".',
        'After a git pull or a big batch of edits: "graphify update .", otherwise the graph describes the old code.',
      ],
    },
    attention: {
      fr: '« graphify install » écrit dans ton CLAUDE.md global et ajoute un skill de 43 Ko qui se déclenche pour toute question de code ; « graphify claude install » ajoute dans le projet un hook qui intervient avant chaque lecture de fichier, et --strict bloque la première lecture. Le bouton n\'installe que la commande. Le graphe ne voit pas tes modifs non commitées tant que tu ne relances pas « graphify update . ». Ajoute graphify-out/ au .gitignore. uv range ses outils sur C: par défaut (variable UV_TOOL_DIR pour changer).',
      en: '"graphify install" writes into your global CLAUDE.md and adds a 43 KB skill that fires for any code question; "graphify claude install" adds a project hook that steps in before every file read, and --strict blocks the first read. The button only installs the command. The graph does not see uncommitted edits until you run "graphify update ." again. Add graphify-out/ to .gitignore. uv puts its tools on C: by default (UV_TOOL_DIR variable to change it).',
    },
  },
  {
    id: 'remotion',
    nom: 'Remotion (skills vidéo)',
    depot: 'remotion-dev/skills',
    categorie: 'video',
    etoiles: 4859,
    licence: 'Remotion License',
    action: { type: 'skills', depot: 'remotion-dev/skills', skills: ['remotion-best-practices', 'remotion-create', 'remotion-markup', 'remotion-render'] },
    cout: {
      jetons: null,
      note: {
        fr: 'Environ 60 tokens par session, et seulement dans le projet où tu les ajoutes (le nom et la description de 4 skills). Le contenu d\'un skill n\'est lu que quand Claude fait une vidéo.',
        en: 'About 60 tokens per session, and only in the project you add them to (the name and description of 4 skills). A skill\'s content is only read when Claude makes a video.',
      },
    },
    type: { fr: 'Skills officiels (Agent Skills)', en: 'Official skills (Agent Skills)' },
    resume: {
      fr: 'Les skills officiels de Remotion : Claude écrit la vidéo en React (scènes, animations, transitions) puis la rend en MP4 sur ta machine.',
      en: 'Remotion\'s official skills: Claude writes the video in React (scenes, animations, transitions) then renders it to MP4 on your machine.',
    },
    schema: {
      fr: ['Ta demande', 'Projet Remotion créé', 'Scènes en React', 'Images clés vérifiées', 'MP4 rendu en local'],
      en: ['Your request', 'Remotion project created', 'Scenes in React', 'Key frames checked', 'MP4 rendered locally'],
    },
    description: {
      fr: [
        'Remotion fait des vidéos avec du code : chaque scène est un composant React, chaque animation dépend du numéro d\'image, et le rendu passe par Chrome headless et ffmpeg (fournis par Remotion, rien à installer à part Node.js). Même code = même vidéo, on peut donc la retoucher en une phrase (« transitions 20 % plus lentes ») et la refaire en quelques secondes.',
        'Les skills donnent à Claude les bonnes pratiques de Remotion : créer le projet, une scène par fichier, animations pilotées par useCurrentFrame et interpolate (les animations CSS ne se rendent pas), transitions entre scènes, tailles de texte lisibles en vidéo, puis la commande de rendu. La vidéo de présentation du relais (docs/relais.mp4) a été faite avec.',
      ],
      en: [
        'Remotion makes videos with code: each scene is a React component, each animation depends on the frame number, and rendering goes through headless Chrome and ffmpeg (shipped by Remotion, nothing to install but Node.js). Same code = same video, so it can be tweaked in one sentence ("transitions 20% slower") and redone in seconds.',
        'The skills give Claude Remotion\'s best practices: create the project, one scene per file, animations driven by useCurrentFrame and interpolate (CSS animations do not render), transitions between scenes, text sizes readable on video, then the render command. The relais overview video (docs/relais.mp4) was made with them.',
      ],
    },
    contenu: {
      fr: [
        ['remotion-create', 'Crée le projet (npx create-video) et pose la structure de la vidéo.'],
        ['remotion-markup', 'Animations, scènes multiples, transitions, textes, images, sons.'],
        ['remotion-render', 'Rendu en MP4, en image fixe ou en série d\'images (pour vérifier).'],
        ['remotion-best-practices', 'Aiguillage vers le bon skill, et la documentation à jour de Remotion.'],
      ],
      en: [
        ['remotion-create', 'Creates the project (npx create-video) and sets up the video structure.'],
        ['remotion-markup', 'Animations, multiple scenes, transitions, text, images, sound.'],
        ['remotion-render', 'Renders to MP4, a still image or a series of frames (to check).'],
        ['remotion-best-practices', 'Routes to the right skill, plus Remotion\'s up-to-date docs.'],
      ],
    },
    installation: {
      fr: [
        ['Dans le dossier du projet (Node.js requis)', 'npx skills add remotion-dev/skills -a claude-code -s remotion-best-practices remotion-create remotion-markup remotion-render --copy -y'],
        ['Rendre la vidéo', 'npx remotion render <composition> out/video.mp4'],
      ],
      en: [
        ['In the project folder (Node.js required)', 'npx skills add remotion-dev/skills -a claude-code -s remotion-best-practices remotion-create remotion-markup remotion-render --copy -y'],
        ['Render the video', 'npx remotion render <composition> out/video.mp4'],
      ],
    },
    utilisation: {
      fr: [
        'Demande à Claude : « fais une vidéo de 30 s qui présente ce projet, en 1920×1080, aux couleurs du site ».',
        'Demande-lui de rendre quelques images clés avant le rendu complet : c\'est là qu\'on voit un texte qui déborde.',
        'Pour retoucher : « la scène 3 est trop rapide », « remplace le titre », puis « refais le rendu ».',
      ],
      en: [
        'Ask Claude: "make a 30-second video presenting this project, 1920×1080, in the site\'s colours".',
        'Ask it to render a few key frames before the full render: that is where overflowing text shows up.',
        'To tweak: "scene 3 is too fast", "replace the title", then "render it again".',
      ],
    },
    demo: {
      video: '/demo/remotion.mp4',
      legende: {
        fr: 'Le robot qui relit une pile de pages de plus en plus haute, puis la range dans une petite boîte « relais ». Vidéo faite avec ces skills.',
        en: 'The little robot that re-reads an ever taller stack of pages, then packs it into a small "relais" box. Video made with these skills.',
      },
    },
    prompt: {
      texte: {
        fr: 'Utilise le skill remotion-best-practices et fais-moi une vidéo de 30 à 60 s qui explique [ton sujet] comme une petite histoire : un personnage animé qui vit la situation (le problème, puis la solution), des mouvements de caméra, des transitions animées, des particules et du texte court animé. Pas de diapos ni de texte statique. Rends un MP4 et vérifie les images clés avant de finir.',
        en: 'Use the remotion-best-practices skill and make me a 30 to 60 s video that explains [your topic] as a little story: an animated character living the situation (the problem, then the solution), camera moves, animated transitions, particles and short animated text. No slides and no static text. Render an MP4 and check the key frames before you finish.',
      },
      conseil: {
        fr: 'Décris une histoire concrète (qui fait quoi, ce qui change), pas une liste de points : Claude en tire de vraies scènes au lieu de diapos.',
        en: 'Describe a concrete story (who does what, what changes), not a list of points: Claude turns it into real scenes instead of slides.',
      },
    },
    attention: {
      fr: 'Remotion est gratuit pour un particulier et les équipes de 3 personnes au plus ; au-delà, une licence d\'entreprise est payante. Le premier rendu télécharge Chrome headless (environ 100 Mo) dans node_modules du projet : mets le projet sur un disque qui a de la place. Le bouton copie les skills dans le projet choisi seulement, jamais partout.',
      en: 'Remotion is free for individuals and teams of up to 3 people; beyond that, a company licence is paid. The first render downloads headless Chrome (about 100 MB) into the project\'s node_modules: keep the project on a roomy drive. The button copies the skills into the chosen project only, never everywhere.',
    },
  },
];

// Every text field holding { fr, en }, in the template order.
export const CHAMPS_TRADUITS = ['type', 'resume', 'schema', 'description', 'contenu', 'installation', 'utilisation', 'attention'];

const choisir = (v, langue) => (v && typeof v === 'object' && !Array.isArray(v) && 'fr' in v && 'en' in v ? v[langue] : v);

// The cards in one language ('fr' or 'en').
export function skillsExternes(langue = 'en') {
  const l = langue === 'fr' ? 'fr' : 'en';
  return {
    releve, langue: l, stylesDesign: STYLES_DESIGN,
    categories: CATEGORIES.map((c) => ({ id: c.id, nom: choisir(c.nom, l), description: choisir(c.description, l) })),
    skills: SKILLS_EXTERNES.map((s) => ({
      ...s,
      ...Object.fromEntries(CHAMPS_TRADUITS.map((k) => [k, choisir(s[k], l)])),
      cout: { jetons: s.cout?.jetons ?? null, note: choisir(s.cout?.note, l) || '' },
      action: s.action ? { ...s.action, ensuite: choisir(s.action.ensuite, l) } : null,
      demo: s.demo ? { video: s.demo.video, legende: choisir(s.demo.legende, l) } : null,
      prompt: s.prompt ? { texte: choisir(s.prompt.texte, l), conseil: choisir(s.prompt.conseil, l) } : null,
      url: `https://github.com/${s.depot}`,
    })),
  };
}
