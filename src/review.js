const $ = id => document.getElementById(id)

let _groups = []
let _autoKeptHandles = []
let _groupIndex = 0
let _selections = new Set()
let _keptHandles = []
let _onComplete = null
let _objectURLs = []

export async function initReview(groups, autoKeptHandles, onComplete) {
  _groups = groups
  _autoKeptHandles = autoKeptHandles
  _groupIndex = 0
  _keptHandles = []
  _onComplete = onComplete
  if (!groups.length) { _onComplete([..._autoKeptHandles]); return }
  _objectURLs.forEach(url => URL.revokeObjectURL(url))
  _objectURLs = []
  await renderGroup(0)
}

async function renderGroup(idx) {
  const group = _groups[idx]
  _selections = new Set([0])

  _objectURLs.forEach(url => URL.revokeObjectURL(url))
  _objectURLs = []

  $('review-header').innerHTML = `
    <h2 style="font-size:16px;font-weight:600;color:var(--text);margin-bottom:4px">
      Gruppe ${idx + 1} von ${_groups.length} ähnlichen Bildern
    </h2>
    <p style="font-size:12px;color:var(--muted)">Klicke auf ein Bild um die Auswahl zu ändern. Mehrfachauswahl möglich.</p>
  `

  const pct = Math.round(((idx + 1) / _groups.length) * 100)
  $('review-progress').innerHTML = `
    <div style="background:var(--bg);border-radius:6px;height:4px;margin:10px 0 14px">
      <div style="background:var(--blue);height:4px;border-radius:6px;width:${pct}%;transition:width 0.3s"></div>
    </div>
  `

  const grid = $('review-grid')
  grid.innerHTML = ''

  for (let i = 0; i < group.members.length; i++) {
    const handle = group.members[i]
    const file = await handle.getFile()
    const url = URL.createObjectURL(file)
    _objectURLs.push(url)

    const sizeMB = (file.size / 1024 / 1024).toFixed(1)
    const date = new Date(file.lastModified).toLocaleDateString('de-DE')
    const isSuggested = i === 0
    const simPct = isSuggested ? null : Math.round((1 - group.similarities[i] / 64) * 100)
    const isSelected = _selections.has(i)

    const card = document.createElement('div')
    card.className = 'review-card' + (isSelected ? ' selected' : '')
    card.dataset.idx = String(i)
    card.setAttribute('role', 'button')
    card.setAttribute('tabindex', '0')
    card.setAttribute('aria-pressed', String(isSelected))
    card.innerHTML = `
      <div class="review-thumb">
        <img loading="lazy" />
        <div class="review-pill ${isSelected ? 'keep' : 'skip'}">${isSelected ? '✓ BEHALTEN' : 'ÜBERSPRINGEN'}</div>
      </div>
      <div class="review-meta">
        <div class="review-filename"></div>
        <div class="review-info">${group.widths[i]} × ${group.heights[i]} px</div>
        <div class="review-info">${sizeMB} MB · ${date}</div>
        <div class="review-badge${isSuggested ? ' original' : ''}">${isSuggested ? 'Originalauflösung' : simPct + '% ähnlich'}</div>
      </div>
    `
    card.querySelector('img').src = url
    card.querySelector('img').alt = file.name
    card.querySelector('.review-filename').textContent = file.name
    card.addEventListener('click', () => toggleCard(card, i))
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCard(card, i) } })
    grid.appendChild(card)
  }

  updateActions()
}

function toggleCard(card, idx) {
  if (_selections.has(idx)) {
    _selections.delete(idx)
    card.classList.remove('selected')
    card.querySelector('.review-pill').className = 'review-pill skip'
    card.querySelector('.review-pill').textContent = 'ÜBERSPRINGEN'
    card.setAttribute('aria-pressed', 'false')
  } else {
    _selections.add(idx)
    card.classList.add('selected')
    card.querySelector('.review-pill').className = 'review-pill keep'
    card.querySelector('.review-pill').textContent = '✓ BEHALTEN'
    card.setAttribute('aria-pressed', 'true')
  }
  updateActions()
}

function keepAll() {
  const group = _groups[_groupIndex]
  for (let i = 0; i < group.members.length; i++) _selections.add(i)
  $('review-grid').querySelectorAll('.review-card').forEach((card) => {
    card.classList.add('selected')
    const pill = card.querySelector('.review-pill')
    pill.className = 'review-pill keep'
    pill.textContent = '✓ BEHALTEN'
    card.setAttribute('aria-pressed', 'true')
  })
  advance()
}

async function advance() {
  if (!_groups.length || !_onComplete) return

  const group = _groups[_groupIndex]
  for (const idx of _selections) _keptHandles.push(group.members[idx])

  _groupIndex++
  if (_groupIndex < _groups.length) {
    await renderGroup(_groupIndex)
  } else {
    _objectURLs.forEach(url => URL.revokeObjectURL(url))
    _objectURLs = []
    await _onComplete([..._keptHandles, ..._autoKeptHandles])
  }
}

function updateActions() {
  const group = _groups[_groupIndex]
  const skipCount = group.members.length - _selections.size
  const weiterLabel = skipCount > 0 ? `→ Weiter (${skipCount} überspringen)` : '→ Weiter'

  $('review-actions').innerHTML = `
    <div style="display:flex;gap:10px;margin-top:14px">
      <button id="btn-keep-all" class="btn btn-secondary" style="flex:1">Alle behalten</button>
      <button id="btn-advance" class="btn btn-primary" style="flex:2">${weiterLabel}</button>
    </div>
    <div style="margin-top:12px;padding:10px;background:var(--bg);border-radius:8px;border-left:3px solid var(--blue)">
      <p style="color:var(--muted);font-size:12px;margin:0">💡 Grüner Rahmen = wird kopiert.</p>
    </div>
  `
  $('btn-keep-all').addEventListener('click', keepAll)
  $('btn-advance').addEventListener('click', advance)
}

export function cancelReview() {
  _objectURLs.forEach(url => URL.revokeObjectURL(url))
  _objectURLs = []
  _groups = []
  _autoKeptHandles = []
  _keptHandles = []
  _selections = new Set()
  _groupIndex = 0
  _onComplete = null
}
