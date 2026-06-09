import { describe, it, expect } from 'vitest'
import { hammingDistance, dhash } from '../src/hash-utils.js'

describe('hammingDistance', () => {
  it('identical arrays → 0', () => {
    expect(hammingDistance(new Uint8Array([0, 0]), new Uint8Array([0, 0]))).toBe(0)
  })
  it('single byte fully flipped → 8', () => {
    expect(hammingDistance(new Uint8Array([0xFF, 0]), new Uint8Array([0, 0]))).toBe(8)
  })
  it('single bit difference → 1', () => {
    expect(hammingDistance(new Uint8Array([0b00000001]), new Uint8Array([0b00000000]))).toBe(1)
  })
})

describe('dhash', () => {
  it('returns 8-byte Uint8Array', () => {
    // Create a 9x8 gradient image (pixel values decreasing left to right)
    const pixels = new Uint8ClampedArray(9 * 8 * 4)
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 9; col++) {
        const i = (row * 9 + col) * 4
        const v = (8 - col) * 28 // decreasing brightness left to right
        pixels[i] = v; pixels[i+1] = v; pixels[i+2] = v; pixels[i+3] = 255
      }
    }
    const hash = dhash(pixels)
    expect(hash).toBeInstanceOf(Uint8Array)
    expect(hash.length).toBe(8)
    // All bits set: left pixel always brighter → all 1s
    expect(Array.from(hash).every(b => b === 0xFF)).toBe(true)
  })
})
