# ⛏️ VOXELCRAFT ULTIMATE — Sandbox Voxel 3D Photo-HD & P2P (100 % GitHub Pages)

🌐 **Jouer en Ligne (GitHub Pages) :** [https://axeldelaro.github.io/micepwa/](https://axeldelaro.github.io/micepwa/)  
📦 **Dépôt GitHub :** [https://github.com/axeldelaro/micepwa](https://github.com/axeldelaro/micepwa)

**VoxelCraft Ultimate** est un moteur bac à sable voxel 3D complet en **TypeScript + Three.js + Web Workers + WebRTC P2P**, conçu pour tourner **à 100 % sur GitHub Pages** sans aucun serveur backend propriétaire.

---

## ✨ Nouveautés Ultimate Edition

### 1. Triple Moteur Graphique & 4 Packs de Design Commutables à la Volée
- **3 Moteurs de Rendu Temps Réel :**
  - 📸 **Vue Réelle (Cinéma Photo-Réaliste HD)** : Atlas haute définition `2048x2048` (`64x64` micro-détails par bloc), filtrage anisotrope matériel maximal, Normal Maps haute précision, ombres douces `PCFSoftShadowMap`, éclairage dynamique de torche/lanterne en main (*Dynamic Hand Light*), reflets mouillés PBR sous la pluie, post-traitement `UnrealBloomPass` + `CinemaRealismPass` (netteté adaptative, halo solaire atmosphérique, colorimétrie cinéma).
  - ✨ **Graphismes Élevés (Shaders PBR)** : Ombres temps réel, eau GLSL animée (vagues Gerstner/sinus, Fresnel, reflets solaires, écume côtière), vent dans le feuillage et Bloom.
  - 🎨 **Classique Fidèle (60+ FPS)** : Rendu ultra-rapide `NearestFilter`, Ambient Occlusion voxel 4 niveaux et Smooth Lighting double canal.
- **4 Packs de Textures Procéduraux (bascule instantanée sans recharger le monde) :**
  1. 📸 **Vue Réelle Photo-HD (64x PBR)**
  2. 🎨 **Classique Fidèle (16x Minecraft)**
  3. 🏰 **Médiéval Fantasy RPG (32x)**
  4. ⚡ **Néons Cyber-Voxel (Circuits Émissifs Bloom)**

### 2. Cinq Modes de Jeu Complets
- ⚔️ **Survie Classique** : Santé, Faim, Oxygène, Boucliers d'Armure (`🛡️`), Cœurs d'Absorption (`💛`), récolte et artisanat.
- 🪽 **Créatif & Architecte** : Vol libre, Catalogue complet avec recherche instantanée et construction rapide.
- 🛡️ **Défense de Bastion (Vagues)** : Repoussez des vagues progressives de monstres nocturnes avec vos Gardes IA et battez votre record de score !
- 💀 **Hardcore (1 Vie)** : Dégâts accrus, aucune régénération passive facile et mort définitive.
- 📷 **Spectateur / Cinéma Libre** : Vol *No-Clip* à travers montagnes et cavernes, zoom optique à la molette et touche `F1` pour masquer l'interface.

### 3. Arsenal, Gadgets, Météo & Structures Naturelles
- **Armes & Outils Spéciaux** : **Arc Chasseur + Flèches 3D balistiques**, **Grappin Véloce (32m)** avec câble 3D, **Marteau d'Excavation 3x3**, **Baguette d'Architecte** (pose en 1 clic un *Chalet Meublé*, une *Tour Médiévale* ou une *Pyramide d'Or* ; `Sneak + Clic Droit` pour changer de plan), **Seaux d'Eau et de Lave**, **Armures en Fer & Diamant**, **Pomme Dorée Enchantée**.
- **Nouveaux Blocs** : *Marbre Blanc Ciselé, Obsidienne Volcanique (anti-explosion), Bibliothèque, Lanterne Forgée, Pierre Moussue, Blocs d'Or / Diamant / Émeraude / Acier, Bloc de Magma, Bloc de Slime Trampoline rebondissant, Basalte Poli, Cristaux d'Améthyste Lumineux*.
- **Structures Générées par Seed** : Pyramides du Désert avec chambre au trésor, Tours de Guet en ruines dans les Plaines et cavernes profondes à Cristaux d'Améthyste.
- **Météo Dynamique Synchronisée** : `☀️ Clair`, `🌧️ Pluie Réaliste` (sol mouillé réfléchissant), `❄️ Neige`, `⛈️ Orage & Éclairs`.

### 4. Multijoueur Serverless P2P Triple-Transport
- **Serveur Autoritaire Embarqué à 20 TPS** dans l'onglet de l'hôte (`EmbeddedHostServer.ts`).
- **Triple Transport Automatique** :
  1. **WebRTC DataChannels (`PeerJS`)** : Canal binaire rapide `ArrayBuffer` 20 Hz + Canal fiable ordonné (`seed`, `worldDeltas`, coffres, explosions, météo, chat).
  2. **Relais WebRTC Décentralisés (`Trystero`)** en secours sans serveur propriétaire.
  3. **`BroadcastChannel` Local Instantané (< 2 ms)** pour tester le multijoueur entre plusieurs onglets sur le même PC même hors-ligne.
- **Code de Salon (`VX-XXXX`), Lien Direct (`?room=VX-XXXX`) & QR Code ISO-18004 généré sur Canvas**.

---

## 🚀 Développement Local & Déploiement GitHub Pages

```bash
npm install
npm run dev      # Serveur local http://localhost:5173/
npm run build    # Compilation TypeScript + bundle statique dist/
```

Sur GitHub (`https://github.com/axeldelaro/micepwa`), vérifiez que **`Settings -> Pages -> Build and deployment -> Source`** est réglé sur **`GitHub Actions`** (ou sur la branche `gh-pages` publiée automatiquement) : chaque `git push` sur `main` met à jour `https://axeldelaro.github.io/micepwa/`.
