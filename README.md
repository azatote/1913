# README technique APP

## Fichiers
- `public/index.html`: structure de l'interface, panneaux, zones de main, table
- `public/styles.css`: layout, theme, zones fixes, table scrollable, tailles des mains
- `public/app.js`: logique complete du jeu, rendu, synchro reseau, drag/drop, perspective joueur
- `public/carte_radio/`: images des cartes
- `server.js`: serveur Node.js minimal, diffusion temps reel SSE, API JSON, attribution des joueurs, sert `public/`
- `package.json`: script de lancement du serveur

## Structure logique dans `app.js`
- Etat principal:
  - `piles`
  - `hands`
  - `selectedPileId`
  - `activePlayerId`
  - `viewerPlayerId`
  - `tableZoom`
  - `sessionRevision`
- Joueurs:
  - `top` = Joueur 2
  - `bottom` = Joueur 1

## Fonctions a connaitre en priorite
- Perspective / affichage:
  - `getViewerBottomPlayerId()`
  - `getViewerTopPlayerId()`
  - `isTopViewerPerspective()`
  - `getDisplayPosition(modelX, modelY)`
  - `getModelPointerPosition(viewX, viewY)`
  - `getViewedRowIndex(rowIndex)`
- Session / sync:
  - `getSessionState()`
  - `saveSessionState()`
  - `loadSessionState()`
  - `restoreSessionState(sessionState)`
  - `handleCompleteReset(isRemote)`
- Table / placement:
  - `getRowYPositions()`
  - `snapPileToRow(pile)`
  - `snapPileVertically(pile)`
  - `getPlayPositionForPlayer(playerId)`
- Drag and drop:
  - `startDrag(event, pileId)`
  - `onPointerMove(event)`
  - `onPointerUp(event)`
  - `startHandDrag(playerId, cardIndex)`
  - `onBoardDrop(event)`
  - `getHandDropPlayerIdFromPoint(clientX, clientY)`
  - `movePileToHand(pileId, playerId)`
- Rendu:
  - `createPileElement(pile)`
  - `createHandCardElement(playerId, card, index)`
  - `renderHand(playerId, zoneElement, cardsElement, metaElement)`
  - `render()`

## Regle importante sur les coordonnees
La source de verite reste la coordonnee de modele partagee entre toutes les fenetres.

- Une pile est stockee en coordonnees de modele.
- Selon le joueur de la session, cette pile peut etre affichee a une autre position ecran.
- Le pointeur utilisateur doit donc etre reconverti vers la coordonnee de modele avant toute modification.

Si une future modification casse l'alignement entre la main visible et la ligne de pose, verifier d'abord:
1. `getDisplayPosition(...)`
2. `getModelPointerPosition(...)`
3. `getPlayPositionForPlayer(...)`
4. `createPileElement(...)`
5. `getBoardPointerPosition(...)`

## Comportement attendu par session
### Session Joueur 1
- Main Joueur 1 en bas
- Main Joueur 2 en haut
- Ligne de pose Joueur 1 juste au-dessus de la main du bas
- Ligne de pose Joueur 2 a l'oppose

### Session Joueur 2
- Main Joueur 2 en bas
- Main Joueur 1 en haut
- Ligne de pose Joueur 2 juste au-dessus de la main du bas
- Ligne de pose Joueur 1 a l'oppose

## Mode multi-poste
La source de verite n'est plus le navigateur local.

- Le serveur `server.js` porte l'etat partage de la partie.
- Les clients chargent l'etat via `GET /api/bootstrap`.
- Les clients publient leurs changements via `POST /api/session`.
- Le serveur diffuse les mises a jour via `EventSource` sur `GET /api/events`.
- Les reservations de joueur passent par `POST /api/player/reserve` et `POST /api/player/release`.
- Un heartbeat evite qu'un joueur reste bloque trop longtemps si un navigateur disparait sans fermeture propre.

## Lancement local ou sur Raspberry Pi
### Prerequis
- Node.js 18 ou plus recent

### Demarrage
Dans le dossier `APP`:

```powershell
npm start
```

Le serveur ecoute par defaut sur `http://0.0.0.0:8765`.

Depuis un autre poste du reseau local, ouvrir:

```text
http://IP_DU_RASPBERRY:8765
```

Exemple:

```text
http://192.168.1.42:8765
```

## Demarrage automatique avec systemd sur Raspberry Pi
Un fichier de service pret a l'emploi est fourni dans `nandeck1913.service`.
Une variante `www-data` est aussi fournie dans `nandeck1913.www-data.service`.

### Hypotheses du fichier fourni
- utilisateur Linux: `pi`
- projet copie dans `/var/www/html/domo/APP/APP/APP`
- `npm` disponible dans `/usr/bin/npm`

### Variante pour www-data
Utilise `nandeck1913.www-data.service` si le dossier du projet appartient a `www-data` ou si ton environnement web Raspberry execute deja les processus applicatifs sous cet utilisateur.

Le service `www-data` contient:
- `User=www-data`
- `Group=www-data`
- `WorkingDirectory=/var/www/html/domo/APP/APP/APP`

Avant de l'activer, verifie que `www-data` peut lire et executer ce dossier ainsi que `node` et `npm`.

Si ton Raspberry utilise un autre utilisateur ou un autre chemin, adapte ces lignes dans `nandeck1913.service`:
- `User=`
- `WorkingDirectory=`
- `ExecStart=`

### Installation du service

```bash
sudo cp nandeck1913.service /etc/systemd/system/nandeck1913.service
sudo systemctl daemon-reload
sudo systemctl enable nandeck1913.service
sudo systemctl start nandeck1913.service
```

### Verification

```bash
sudo systemctl status nandeck1913.service
journalctl -u nandeck1913.service -f
```

### Installation de la variante www-data

```bash
sudo cp nandeck1913.www-data.service /etc/systemd/system/nandeck1913.service
sudo systemctl daemon-reload
sudo systemctl enable nandeck1913.service
sudo systemctl start nandeck1913.service
sudo systemctl status nandeck1913.service
```

### Verification des permissions

```bash
ls -ld /var/www/html/domo/APP/APP/APP
sudo -u www-data /usr/bin/npm --prefix /var/www/html/domo/APP/APP/APP start
```

Si cette commande echoue, il faut corriger le proprietaire ou les droits du dossier avant d'utiliser le service `www-data`.

### Redemarrage apres mise a jour

```bash
sudo systemctl restart nandeck1913.service
```

## Validation utile apres chaque changement
- Verifier absence d'erreurs sur `APP/app.js` et `APP/server.js`
- Lancer `node --check server.js`
- Charger `http://127.0.0.1:8765/`
- Tester dans deux navigateurs ou deux postes:
  - attribution automatique du deuxieme joueur
  - drag table -> main
  - drag main -> table
  - synchro des positions
  - alignement entre main visible et ligne de pose
