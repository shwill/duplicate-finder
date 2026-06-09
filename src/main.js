import { pickSourceFolders, pickTargetFolder, collectImageFiles } from './filesystem.js'
import { copyUniqueFiles } from './organizer.js'

// State
let sourceHandles = []
let targetHandle = null
let selectedMode = 'both'
let uniqueHandles = []
let scanStats = {}

// DOM refs
const $ = id => document.getElementById(id)

// Screen management
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'))
  $(`screen-${name}`).classList.add('active')
}

// Setup screen
$('btn-add-source').addEventListener('click', async () => {
  try {
    sourceHandles = await pickSourceFolders(sourceHandles)
    renderSourceList()
    updateStartButton()
  } catch (e) {
    if (e.name !== 'AbortError') console.error(e)
  }
})

$('target-display').addEventListener('click', async () => {
  try {
    targetHandle = await pickTargetFolder()
    $('target-name').textContent = targetHandle.name
    $('target-name').style.color = 'var(--text)'
    updateStartButton()
  } catch (e) {
    if (e.name !== 'AbortError') console.error(e)
  }
})

document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('selected'))
    btn.classList.add('selected')
    selectedMode = btn.dataset.mode
    $('p2-row').style.display = selectedMode === 'both' ? 'block' : 'none'
  })
})

function renderSourceList() {
  const list = $('source-list')
  list.innerHTML = sourceHandles.map((h, i) => `
    <div class="folder-item">
      <span>📁 ${h.name}</span>
      <button data-idx="${i}" title="Entfernen">×</button>
    </div>
  `).join('')
  list.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      sourceHandles.splice(Number(btn.dataset.idx), 1)
      renderSourceList()
      updateStartButton()
    })
  })
}

function updateStartButton() {
  $('btn-start').disabled = sourceHandles.length === 0 || !targetHandle
}

$('btn-start').addEventListener('click', startScan)

// Scan
async function startScan() {
  showScreen('processing')
  const startTime = Date.now()

  $('p2-row').style.display = selectedMode === 'both' ? 'block' : 'none'

  // Collect all file handles
  const allHandles = await collectImageFiles(sourceHandles)
  const total = allHandles.length

  // Start worker
  const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })

  worker.postMessage({ type: 'start', handles: allHandles, mode: selectedMode })

  worker.onmessage = ({ data }) => {
    if (data.type === 'phase1-progress') {
      const pct = Math.round((data.current / total) * 100)
      $('p1-fill').style.width = `${pct}%`
      $('p1-status').textContent = `${data.current} / ${total}`
      $('stat-exact').textContent = data.exactDuplicates
      const elapsed = (Date.now() - startTime) / 1000
      if (data.current > 0) {
        const eta = Math.round((elapsed / data.current) * (total - data.current))
        $('eta-text').textContent = eta > 5 ? `Phase 1: noch ca. ${eta}s...` : 'Fast fertig...'
      }
    }

    if (data.type === 'phase2-progress') {
      $('p1-fill').style.width = '100%'
      $('p1-status').textContent = `${total} / ${total} ✓`
      const pct = Math.round((data.current / data.total) * 100)
      $('p2-fill').style.width = `${pct}%`
      $('p2-status').textContent = `${data.current} / ${data.total}`
      $('stat-similar').textContent = data.similarDuplicates
    }

    if (data.type === 'done') {
      uniqueHandles = data.uniqueHandles
      scanStats = data.stats
      worker.terminate()
      showResults()
    }

    if (data.type === 'error') {
      worker.terminate()
      alert(`Fehler: ${data.message}`)
      showScreen('setup')
    }
  }
}

async function showResults() {
  const { scanned, exact, similar } = scanStats
  const unique = scanned - exact - similar

  $('res-scanned').textContent = scanned
  $('res-unique').textContent = unique
  $('res-exact').textContent = exact
  $('res-similar').textContent = similar

  await buildFolderPreview()
  showScreen('results')
}

async function buildFolderPreview() {
  const { extractDate, dateToParts } = await import('./exif.js')
  const sample = uniqueHandles.slice(0, 20)
  const years = new Set()

  for (const h of sample) {
    const file = await h.getFile()
    const date = await extractDate(file)
    const { year } = dateToParts(date)
    years.add(year)
  }

  const sorted = [...years].sort()
  $('folder-preview').innerHTML = sorted.map(y =>
    `📁 ${targetHandle.name}/${y}/`
  ).join('<br>') + (uniqueHandles.length > 20 ? '<br>...' : '')
}

// Copy
$('btn-copy').addEventListener('click', async () => {
  $('btn-copy').disabled = true
  $('copy-progress-card').style.display = 'block'

  await copyUniqueFiles(uniqueHandles, targetHandle, (done, tot) => {
    $('copy-status').textContent = `${done} / ${tot}`
    $('copy-fill').style.width = `${Math.round((done / tot) * 100)}%`
  })

  $('btn-copy').textContent = '✓ Fertig!'
})

$('btn-restart').addEventListener('click', () => {
  sourceHandles = []; targetHandle = null; uniqueHandles = []; scanStats = {}
  selectedMode = 'both'
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('selected'))
  document.querySelector('.mode-btn[data-mode="both"]').classList.add('selected')
  renderSourceList()
  $('target-name').textContent = 'Noch kein Ordner gewählt'
  $('target-name').style.color = 'var(--muted)'
  updateStartButton()
  showScreen('setup')
})

// PWA service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/duplicate-finder/sw.js')
}
