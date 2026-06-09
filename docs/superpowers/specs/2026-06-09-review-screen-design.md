# Review Screen — Design Spec

**Date:** 2026-06-09
**Feature:** Perceptual duplicate review screen
**Status:** Approved

---

## Problem

The perceptual (dHash) deduplication phase makes decisions silently. The user cannot see which images are being skipped, making the tool feel untrustworthy — especially for family photos where no deletion is wanted.

## Goal

Add a review step between the scan and the copy operation. For each group of perceptually similar images the user sees thumbnails, metadata, and can override which images to keep before copying begins. Exact duplicates remain handled silently (only the highest-resolution version is kept, no user action required).

---

## User Flow

```
Setup → Scan → [Review] → Copy
```

The Review screen is skipped entirely when Phase 2 finds zero perceptual duplicate groups (either because the user chose "exact only" mode or because no perceptual duplicates exist).

---

## Worker Changes

### Connected Components Algorithm

Replace the current greedy `dedupGroup` with a proper Connected Components algorithm using BFS within each month bucket:

1. Build an adjacency list: for every pair (i, j) in the bucket, add an edge if `hammingDistance(hash_i, hash_j) <= HAMMING_THRESHOLD`.
2. BFS/DFS from each unvisited node to collect all transitively connected images into one group.
3. Discard singleton components (only one image → not a duplicate).

This correctly handles A≈B≈C cases where the current greedy algorithm may split or miss members.

### New `done` Message Shape

```js
// Before
{ type: 'done', uniqueHandles: FileSystemFileHandle[], stats }

// After
{
  type: 'done',
  groups: [
    {
      suggested: FileSystemFileHandle,   // highest pixel area (width × height); always members[0]
      members: FileSystemFileHandle[],   // all group members, suggested at index 0
      similarities: number[]             // similarities[i] = hammingDistance(members[i], suggested)
                                         // similarities[0] === 0 (suggested vs itself)
    }
  ],
  autoKeptHandles: FileSystemFileHandle[], // files to copy regardless of review choices
  stats: { scanned, exact, similar }
}
```

`suggested` is the member with the highest `width × height` as read from `ImageBitmap` dimensions (already available from Phase 2 canvas step). `suggested === members[0]` always.

`autoKeptHandles` contains: (a) exact-duplicate survivors from Phase 1 (the highest-resolution copy per SHA-256 group), and (b) all images that are not part of any perceptual group. There is no overlap between `autoKeptHandles` and any `groups[n].members`: Phase 1 removes all but the best copy before Phase 2 runs, and Phase 2 grouping only includes images that share a perceptual duplicate — singletons go directly to `autoKeptHandles`.

---

## Review Screen UI

### Header

```
Gruppe N von M ähnlichen Bildern
[progress bar: N/M width]
```

### Image Grid

Responsive grid (up to 3 columns, wraps for 4+ images).

Each card:
- Thumbnail (aspect-ratio 4/3, `createObjectURL` from FileHandle)
- Pill badge top-left: **✓ BEHALTEN** (green) or **ÜBERSPRINGEN** (grey)
- Filename, resolution (px × px), file size (MB), date
- Similarity badge bottom: "Originalauflösung" for suggested, "N% ähnlich" for others, where N = `Math.round((1 - similarities[i] / 64) * 100)` (64 = max Hamming distance for a 64-bit dHash)

Click toggles selection. Clicking an unselected card selects it (border turns green, pill switches to BEHALTEN). Clicking a selected card deselects it (border turns grey, pill switches to ÜBERSPRINGEN). Multiple images can be selected simultaneously.

On arrival at each group: `suggested` is pre-selected, all others are unselected.

### Action Buttons

```
[ Alle behalten ]   [ → Weiter (N überspringen) ]
```

- **Alle behalten**: selects all cards in the group, then advances to next group
- **Weiter**: advances using current selection. Button label updates live: "Weiter (N überspringen)" where N = group.members.length − selectedCount. If N = 0 shows "→ Weiter".

### Tip

Small info card below buttons: "Grüner Rahmen = wird kopiert."

---

## State Management (`src/review.js`)

```js
// Groups received from worker
let groups = []            // Array of group objects from worker
let groupIndex = 0         // Index of currently displayed group
let selections = new Set() // Indices into groups[groupIndex].members that the user wants to keep
                           // Initialised to new Set([0]) when entering each group (suggested pre-selected)
let keptHandles = []       // Accumulated FileSystemFileHandle[] from confirmed review choices

function renderGroup(idx)  // Clears #review-grid, resets selections to new Set([0]), renders group idx
function advance()         // Reads selections → pushes chosen handles to keptHandles → groupIndex++
                           // If more groups remain: renderGroup(groupIndex)
                           // If no more groups: merge keptHandles + autoKeptHandles → showScreen('results')
```

`advance()` always resets `selections` to `new Set([0])` before calling `renderGroup` for the next group. When all groups are processed, `keptHandles` is merged with `autoKeptHandles` and passed to `copyUniqueFiles`.

---

## HTML Changes (`index.html`)

Add `#screen-review` between `#screen-processing` and `#screen-results`:

```html
<div id="screen-review" class="screen">
  <div id="review-header"></div>
  <div id="review-progress-bar">...</div>
  <div id="review-grid" class="review-grid"></div>
  <div id="review-actions"></div>
</div>
```

The inner content is generated dynamically by `review.js`.

---

## CSS Changes (`src/style.css`)

New classes:
- `.review-grid` — CSS grid, `repeat(auto-fill, minmax(180px, 1fr))`, gap 12px
- `.review-card` — border 2px solid var(--border), border-radius 10px, overflow hidden, cursor pointer, transition border-color 0.15s
- `.review-card.selected` — border-color var(--green)
- `.review-pill` — absolute positioned badge top-left
- `.review-pill.keep` — background var(--green), color dark
- `.review-pill.skip` — background var(--border), color var(--muted)
- `.review-meta` — padding 10px, background var(--surface)
- `.review-similarity` — small badge, blue tint

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| User deselects all images in group | Allowed — all are skipped. "Weiter (N überspringen)" shows full count. No confirmation dialog. The target audience (one user, family photos) is considered safe; a silent skip is less disruptive than a blocking warning. |
| Only 1 perceptual group | Review screen shown for that 1 group, then proceeds to copy. |
| 0 perceptual groups | Review screen skipped entirely, goes directly to results/copy. |
| Group of 2 images | Works normally (suggested + 1 other). |
| Group of 4+ images | Grid wraps, same interaction model. |
| Image file unreadable for thumbnail | Show placeholder icon, metadata still shown. |

---

## Files Touched

| File | Change |
|------|--------|
| `src/worker.js` | Replace `dedupGroup` with Connected Components; change `done` message shape |
| `src/review.js` | **New file** — review screen logic and rendering |
| `src/main.js` | Handle new `done` message; wire `#screen-review`; pass accumulated handles to copy |
| `src/style.css` | Add review card/grid styles |
| `index.html` | Add `#screen-review` div |

---

## Out of Scope

- Zooming into full-resolution image (future)
- Undo navigation (going back to previous group)
- Keyboard shortcuts
- Sorting groups by similarity score
