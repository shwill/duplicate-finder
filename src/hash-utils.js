export function dhash(pixels) {
  const hash = new Uint8Array(8)
  let bit = 0
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const i1 = (row * 9 + col) * 4
      const i2 = (row * 9 + col + 1) * 4
      const g1 = pixels[i1] * 0.299 + pixels[i1+1] * 0.587 + pixels[i1+2] * 0.114
      const g2 = pixels[i2] * 0.299 + pixels[i2+1] * 0.587 + pixels[i2+2] * 0.114
      if (g1 > g2) hash[bit >> 3] |= (1 << (bit & 7))
      bit++
    }
  }
  return hash
}

export function hammingDistance(a, b) {
  let dist = 0
  for (let i = 0; i < a.length; i++) {
    let xor = a[i] ^ b[i]
    while (xor) { dist += xor & 1; xor >>>= 1 }
  }
  return dist
}
