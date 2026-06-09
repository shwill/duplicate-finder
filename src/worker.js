import { dhash, hammingDistance } from './hash-utils.js'
import { connectedComponents } from './cc.js'

const HAMMING_THRESHOLD = 10

self.onmessage = async ({ data }) => {
  const { type, handles, mode } = data
  if (type !== 'start') return

  try {
    const { unique: afterPhase1, exactCount } = await phase1(handles)

    if (mode === 'exact') {
      self.postMessage({
        type: 'done',
        groups: [],
        autoKeptHandles: afterPhase1,
        stats: { scanned: handles.length, exact: exactCount, similar: 0 }
      })
      return
    }

    const { groups, autoKeptHandles, similarCount } = await phase2(afterPhase1)

    self.postMessage({
      type: 'done',
      groups,
      autoKeptHandles,
      stats: { scanned: handles.length, exact: exactCount, similar: similarCount }
    })
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message })
  }
}

async function phase1(handles) {
  const seen = new Map()
  let exactCount = 0

  for (let i = 0; i < handles.length; i++) {
    const handle = handles[i]
    const file = await handle.getFile()
    const buf = await file.arrayBuffer()
    const hashBuf = await crypto.subtle.digest('SHA-256', buf)
    const hex = Array.from(new Uint8Array(hashBuf))
      .map(b => b.toString(16).padStart(2, '0')).join('')

    if (seen.has(hex)) {
      exactCount++
    } else {
      seen.set(hex, handle)
    }

    if (i % 50 === 0) {
      self.postMessage({ type: 'phase1-progress', current: i + 1,
        total: handles.length, exactDuplicates: exactCount })
    }
  }

  return { unique: Array.from(seen.values()), exactCount }
}

async function phase2(handles) {
  const canvas = new OffscreenCanvas(9, 8)
  const ctx = canvas.getContext('2d')
  const entries = []

  for (let i = 0; i < handles.length; i++) {
    const handle = handles[i]
    const file = await handle.getFile()
    const month = getMonthKey(file)

    const bitmap = await createImageBitmap(file)
    const width = bitmap.width
    const height = bitmap.height
    ctx.drawImage(bitmap, 0, 0, 9, 8)
    bitmap.close()
    const { data } = ctx.getImageData(0, 0, 9, 8)
    const hash = dhash(data)

    entries.push({ handle, hash, width, height, month })

    if (i % 20 === 0) {
      self.postMessage({ type: 'phase2-progress', current: i + 1,
        total: handles.length, similarDuplicates: 0 })
    }
  }

  // Group entries by month for O(n²) reduction
  const monthBuckets = new Map()
  entries.forEach((entry, idx) => {
    if (!monthBuckets.has(entry.month)) monthBuckets.set(entry.month, [])
    monthBuckets.get(entry.month).push(idx)
  })

  const groups = []
  const autoKeptHandles = []
  let similarCount = 0

  for (const bucketIndices of monthBuckets.values()) {
    const bucketEntries = bucketIndices.map(i => entries[i])
    const components = connectedComponents(bucketEntries, HAMMING_THRESHOLD)

    for (const component of components) {
      if (component.length === 1) {
        autoKeptHandles.push(entries[bucketIndices[component[0]]].handle)
        continue
      }

      // Find suggested: member with highest pixel area
      const componentEntries = component.map(localIdx => entries[bucketIndices[localIdx]])
      const suggestedLocalIdx = componentEntries.reduce(
        (best, e, i) => e.width * e.height > componentEntries[best].width * componentEntries[best].height ? i : best,
        0
      )

      // Reorder: suggested first
      const reordered = [
        componentEntries[suggestedLocalIdx],
        ...componentEntries.filter((_, i) => i !== suggestedLocalIdx)
      ]

      const suggestedHash = reordered[0].hash

      groups.push({
        suggested: reordered[0].handle,
        members: reordered.map(e => e.handle),
        similarities: reordered.map((e, i) => i === 0 ? 0 : hammingDistance(e.hash, suggestedHash)),
        widths: reordered.map(e => e.width),
        heights: reordered.map(e => e.height)
      })

      similarCount += component.length - 1
    }
  }

  self.postMessage({ type: 'phase2-progress', current: handles.length,
    total: handles.length, similarDuplicates: similarCount })

  return { groups, autoKeptHandles, similarCount }
}

function getMonthKey(file) {
  const d = new Date(file.lastModified)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
