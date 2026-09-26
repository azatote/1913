# Commandes Raspberry

Ce fichier regroupe les commandes utiles pour donner les droits, lancer l'application et activer le service sur le Raspberry.

## Chemin du projet

```bash
/var/www/html/domo/APPX/APP
```

## Donner les droits au dossier

Le plus simple pour cette application est de donner le dossier a `www-data`, car le serveur Node doit lire les fichiers statiques et ecrire l'etat partage de la partie.

```bash
sudo chown -R www-data:www-data /var/www/html/domo/APPX/APP
sudo find /var/www/html/domo/APPX/APP -type d -exec chmod 775 {} \;
sudo find /var/www/html/domo/APPX/APP -type f -exec chmod 664 {} \;
```

## Verifier les droits

```bash
ls -ld /var/www/html/domo/APPX/APP
find /var/www/html/domo/APPX/APP -maxdepth 1 -ls
```

## Lancer l'application manuellement

### En utilisateur courant

```bash
cd /var/www/html/domo/APPX/APP
npm start
```

### En `www-data`

```bash
cd /var/www/html/domo/APPX/APP
sudo -u www-data /usr/bin/npm start
```

## Acceder a l'application depuis un navigateur

Remplacer l'IP par celle du Raspberry:

```text
http://IP_DU_RASPBERRY:8765
```

Exemple:

```text
http://192.168.1.42:8765
```

## Installer le service systemd avec la variante www-data

```bash
sudo cp /var/www/html/domo/APPX/APP/nandeck1913.www-data.service /etc/systemd/system/nandeck1913.service
sudo systemctl daemon-reload
sudo systemctl enable nandeck1913.service
sudo systemctl start nandeck1913.service
sudo systemctl status nandeck1913.service
```

## Voir les logs du service

```bash
journalctl -u nandeck1913.service -f
```

## Redemarrer le service apres modification

```bash
sudo systemctl restart nandeck1913.service
```

## Arreter le service

```bash
sudo systemctl stop nandeck1913.service
```

## Relancer si le service ne demarre pas

Tester d'abord le lancement manuel avec `www-data`:

```bash
cd /var/www/html/domo/APPX/APP
sudo -u www-data /usr/bin/npm start
```

Si cela echoue, verifier:

```bash
which node
which npm
node -v
npm -v
ls -ld /var/www/html/domo/APPX/APP
```

## Note

Ne pas utiliser `chmod 777`. Ce n'est pas necessaire pour cette application.