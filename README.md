# Table 1913

Table de jeu de cartes pour 2 joueurs en temps réel : pioche, retournement, fusion de paquets,
mains cachées, vue retournée pour le joueur 2 et invitation par QR code.

## Stack

| Brique | Rôle |
| --- | --- |
| React 19 + TypeScript 6 (strict) | Interface, composants fonctionnels et hooks |
| Vite 8.3 + `@vitejs/plugin-react` | Dev, build, import des cartes via `import.meta.glob` |
| `qrcode` | QR code d'invitation du second joueur |
| CSS natif | Variables de thème, container queries (`cqw`, `cqh`), `aspect-ratio`, `@keyframes` |
| Supabase (sans serveur à coder) | PostgreSQL, RLS, triggers, Realtime (Postgres Changes, Broadcast, Presence) |
| oxlint | `npm run lint` |
| Vercel | Déploiement à chaque push sur `main`, aperçu pour chaque branche `feature/*` |

## Architecture

- **Le front parle directement à Supabase** : aucune API intermédiaire.
- **Table `nd1913_games`** : une ligne par partie. Le modèle de jeu (piles, mains) est dans la colonne `state` (JSON),
  `revision` sert au contrôle de concurrence.
- **Mise à jour optimiste** : l'action s'affiche tout de suite, puis l'écriture en base
  (`update … where revision = n`) la confirme. Si l'autre joueur a joué entre-temps, l'action est annulée
  et l'état du serveur est rechargé.
- **Contrôles côté base** : contraintes `CHECK` sur la forme du JSON, trigger qui impose `revision = ancienne + 1`
  et vérifie que le paquet contient toujours 56 cartes uniques numérotées de 1 à 56.
- **Deux canaux temps réel** :
  - *Broadcast* : position des paquets pendant un glisser-déposer, suppression de la partie (éphémère) ;
  - *Postgres Changes* : chaque état enregistré.
- **Presence** : joueurs connectés et attribution des places Joueur 1 / Joueur 2 (la place la plus ancienne gagne).
- **Coordonnées de modèle** : la table fait toujours 2200 × 1400 unités, quel que soit l'écran.
  Le joueur 2 voit une image miroir (`mirrorTopLeft`, sa propre inverse).

## Structure

```text
supabase-schema.sql      Script SQL rejouable (SQL Editor de Supabase)
src/game/logic.ts        Règles pures : pioche, retournement, fusion, mains, aimantation aux lignes
src/game/useGame.ts      Synchronisation Supabase : chargement, écriture optimiste, Realtime
src/game/cards.ts        Images des cartes (src/assets/cartes)
src/components/          Accueil, table, mains, choix du joueur, invitation, aperçu
```

## Démarrer

1. Créer un projet sur [supabase.com](https://supabase.com), puis exécuter `supabase-schema.sql` dans le **SQL Editor**
   (à relancer à chaque évolution du schéma, le script est rejouable).
2. Copier `.env.example` en `.env.local` et renseigner `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`.
3. Lancer :

   ```bash
   npm install
   npm run dev
   ```

4. Sur Vercel : importer le dépôt et renseigner les deux mêmes variables d'environnement.
   `vercel.json` fixe les commandes d'installation et de build.

## Commandes

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run build` | Vérification TypeScript puis build dans `dist/` |
| `npm run lint` | oxlint |
| `npm run preview` | Sert le build localement |

## Raccourcis en jeu

| Touche | Action |
| --- | --- |
| Clic sur une pioche | Piocher 1 carte |
| Clic sur une carte visible | La retourner |
| Glisser-déposer | Déplacer, ou fusionner sur un autre paquet |
| Double-clic sur une carte en main | La jouer |
| `D` / `F` | Piocher / retourner le paquet sélectionné |
| `Espace` / `Échap` | Agrandir / fermer l'aperçu |

## Points d'attention

- **Lockfile** : il doit pointer vers `https://registry.npmjs.org/` (et non un miroir interne) et contenir
  les binaires optionnels de toutes les plateformes, sinon le build Vercel échoue.
- **Accès anonyme** : les règles RLS sont ouvertes (outil entre amis, pas de compte).
  Pour un site public, ajouter Supabase Auth et resserrer les règles.
- **Suppression** : le bouton « Supprimer la partie » efface la ligne en base pour les deux joueurs.
