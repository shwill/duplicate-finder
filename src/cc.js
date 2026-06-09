import { hammingDistance } from './hash-utils.js'

// connectedComponents finds all transitively-connected groups.
// entries: Array<{ hash: Uint8Array }>
// threshold: max Hamming distance (inclusive) to consider two entries similar
// returns: Array<number[]> — each inner array is a component (indices into entries)
export function connectedComponents(entries, threshold) {
  const n = entries.length
  if (n === 0) return []

  const adj = Array.from({ length: n }, () => [])
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      if (hammingDistance(entries[a].hash, entries[b].hash) <= threshold) {
        adj[a].push(b)
        adj[b].push(a)
      }
    }
  }

  const visited = new Uint8Array(n)
  const components = []

  for (let start = 0; start < n; start++) {
    if (visited[start]) continue
    const component = []
    const queue = [start]
    visited[start] = 1
    while (queue.length > 0) {
      const cur = queue.shift()
      component.push(cur)
      for (const nb of adj[cur]) {
        if (!visited[nb]) {
          visited[nb] = 1
          queue.push(nb)
        }
      }
    }
    components.push(component)
  }

  return components
}
