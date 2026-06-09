---
name: duplicate-finder-design
description: Web app to find and remove duplicate photos, organize by date — for non-technical Windows user
metadata:
  type: project
---

# Foto-Bereinigung — Design Spec

**Datum:** 2026-06-09  
**URL:** https://shwill.github.io/duplicate-finder/

## Ziel

Eine Browser-basierte Web App (Vite + Vanilla JS), die:
1. Mehrere Quell-Ordner scannt (inkl. Unterordner)
2. Duplikate automatisch entfernt (exakt + visuell ähnlich)
3. Einzigartige Fotos in einen Ziel-Ordner kopiert, sortiert nach `YYYY/YYYY-MM/`

Zielgruppe: nicht-technische Windows-Nutzerin. Alles läuft lokal im Browser — kein Upload, kein Server, kein Internet nach erstem Laden.

## Tech Stack

- **Framework:** Vite + Vanilla JS (kein Framework-Overhead)
- **Hashing:** SubtleCrypto (SHA-256, eingebaut im Browser)
- **EXIF:** exifr.js
- **Processing:** Web Worker (non-blocking)
- **Deployment:** GitHub Actions → GitHub Pages
- **Offline:** PWA mit Service Worker

## UI Flow

### Screen 1 — Setup
- Mehrere Quell-Ordner wählen (File System Access API, `showDirectoryPicker()`)
- Ziel-Ordner wählen
- Modus: "Nur exakte Duplikate" oder "Exakt + Ähnliche"

### Screen 2 — Verarbeitung
- Zwei Fortschrittsbalken (Phase 1 / Phase 2)
- Live-Counter: gefundene exakte / ähnliche Duplikate

### Screen 3 — Ergebnis + Kopieren
- Zusammenfassung: gescannt / einzigartig / Duplikate / eingesparte GB
- Vorschau der Ziel-Ordnerstruktur
- Button: "Fotos in Ziel-Ordner kopieren"

## Algorithmus

### Phase 1 — Exakte Duplikate (~30s für 10k Dateien)
- Alle Dateien als `ArrayBuffer` lesen
- SHA-256 via `SubtleCrypto.digest()` berechnen
- Gleicher Hash → Duplikat → nicht kopieren

### Phase 2 — Ähnliche Bilder (~5–10 Min für 10k Dateien)
- Nur innerhalb desselben Kalendermonats vergleichen (O(n²)-Reduktion)
- Bild in Canvas laden → auf 9×8 px skalieren → dHash (64-bit Differenz-Hash)
- Hamming-Distanz < 10 → ähnliches Bild → nicht kopieren

## Datum-Extraktion (Priorität)

1. EXIF `DateTimeOriginal`
2. EXIF `DateTime`
3. Dateiname-Pattern: `2023-01-15`, `20230115`, `IMG_20230115_...`
4. `file.lastModified`
5. Fallback: `Kein-Datum/`

## Ziel-Ordnerstruktur

```
Zielordner/
  2021/
    2021-06/
      IMG_0001.jpg
      IMG_0002.jpg
    2021-08/
  2022/
  2023/
  Kein-Datum/
```

Namenskonflikte: `IMG_0001_2.jpg`, `IMG_0001_3.jpg` etc.

## Dateistruktur

```
src/
  main.js        # UI-Logik, File System Access API, Screen-Wechsel
  worker.js      # Web Worker: Phase 1 + Phase 2 Algorithmus
  exif.js        # Datum-Extraktion (exifr wrapper + Fallbacks)
  organizer.js   # Kopierlogik, Zielstruktur aufbauen
  style.css      # Styling
public/
  manifest.json  # PWA
  sw.js          # Service Worker (Offline-Cache)
index.html
vite.config.js   # base: '/duplicate-finder/'
.github/
  workflows/
    deploy.yml   # Vite build → GitHub Pages
```

## Deployment

GitHub Actions baut bei jedem Push auf `main`:
1. `npm ci`
2. `npm run build` → `dist/`
3. Deploy zu GitHub Pages via `actions/deploy-pages`

URL: `https://shwill.github.io/duplicate-finder/`
