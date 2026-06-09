import { describe, it, expect } from 'vitest'
import { connectedComponents } from '../src/cc.js'

// Build a Uint8Array[8] hash with specific bits set
function makeHash(setBits = []) {
  const h = new Uint8Array(8)
  for (const bit of setBits) h[bit >> 3] |= 1 << (bit & 7)
  return h
}

describe('connectedComponents', () => {
  it('single entry → one singleton component', () => {
    const entries = [{ hash: makeHash([]) }]
    const result = connectedComponents(entries, 10)
    expect(result).toEqual([[0]])
  })

  it('two identical hashes → one component', () => {
    const h = makeHash([0, 1])
    const entries = [{ hash: h }, { hash: new Uint8Array(h) }]
    const result = connectedComponents(entries, 10)
    expect(result).toHaveLength(1)
    expect(result[0]).toHaveLength(2)
  })

  it('two hashes differing by 12 bits with threshold 10 → two singletons', () => {
    const entries = [
      { hash: makeHash([]) },
      { hash: makeHash([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) } // 12 bits set → distance 12 > 10
    ]
    const result = connectedComponents(entries, 10)
    expect(result).toHaveLength(2)
    expect(result.every(c => c.length === 1)).toBe(true)
  })

  it('A≈B and B≈C but A not directly similar to C → all three in one component', () => {
    // A = bits 0-10 set (11 bits), B = bits 0-4 set (5 bits), C = no bits set
    // d(A,B) = 6 (bits 5-10 differ) ≤ 10 → A≈B
    // d(B,C) = 5 (bits 0-4 differ) ≤ 10 → B≈C
    // d(A,C) = 11 (bits 0-10 differ) > 10 → A not directly ≈ C
    const hashA = makeHash([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    const hashB = makeHash([0, 1, 2, 3, 4])
    const hashC = makeHash([])
    const entries = [{ hash: hashA }, { hash: hashB }, { hash: hashC }]
    const result = connectedComponents(entries, 10)
    expect(result).toHaveLength(1)
    expect(result[0]).toHaveLength(3)
    expect(result[0]).toContain(0)
    expect(result[0]).toContain(1)
    expect(result[0]).toContain(2)
  })

  it('two independent pairs with distance 0 within pairs → two components', () => {
    const entries2 = [{ hash: makeHash([0]) }, { hash: makeHash([0]) }, { hash: makeHash([63]) }, { hash: makeHash([63]) }]
    const result2 = connectedComponents(entries2, 0)
    expect(result2).toHaveLength(2)
    expect(result2.every(c => c.length === 2)).toBe(true)
  })

  it('empty input → empty output', () => {
    expect(connectedComponents([], 10)).toEqual([])
  })

  it('two hashes at exactly the threshold distance → one component', () => {
    // 10 bits differ → distance exactly equals threshold 10 → should be grouped (<=)
    const entries = [
      { hash: makeHash([]) },
      { hash: makeHash([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) }
    ]
    const result = connectedComponents(entries, 10)
    expect(result).toHaveLength(1)
  })

  it('two hashes one step above the threshold → two singletons', () => {
    // 11 bits differ → distance 11 > threshold 10 → should not be grouped
    const entries = [
      { hash: makeHash([]) },
      { hash: makeHash([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) }
    ]
    const result = connectedComponents(entries, 10)
    expect(result).toHaveLength(2)
  })
})
