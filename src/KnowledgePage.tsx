import { ChangeEvent, useMemo, useState } from 'react'
import { importKnowledgeEngine } from './lib/knowledge-import'
import MovementFinder from './MovementFinder'
import MovementSearch from './MovementSearch'
import PartsInventory from './PartsInventory'

type ImportProgress = {
  dataset: string
  processed: number
  total: number
  overallProcessed: number
  overallTotal: number
}

type ImportResult = {
  batchKey: string
  summary: unknown
  engineName: string
  engineVersion: string
  overallTotal: number
}

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export default function KnowledgePage() {
  const [file, setFile] = useState<File | null>(null)
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Choose a Calibre Knowledge Engine JSON file to import or update the library.')

  const percent = useMemo(() => {
    if (!progress || progress.overallTotal <= 0) return 0
    return Math.min(100, Math.round((progress.overallProcessed / progress.overallTotal) * 100))
  }, [progress])

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] ?? null
    setFile(next)
    setProgress(null)
    setResult(null)
    setMessage(next ? `${next.name} ready to import.` : 'Choose a Calibre Knowledge Engine JSON file to import or update the library.')
  }

  async function runImport() {
    if (!file || busy) return
    setBusy(true)
    setProgress(null)
    setResult(null)
    setMessage('Reading knowledge engine…')

    try {
      const imported = await importKnowledgeEngine({
        file,
        onProgress: (next) => {
          setProgress(next)
          setMessage(`Importing ${titleCase(next.dataset)}…`)
        },
      })
      setResult(imported)
      setMessage(`Knowledge Engine ${imported.engineVersion} imported successfully.`)
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error)
      setMessage(`Import failed: ${text}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="knowledge-page">
      <section className="knowledge-heading">
        <div>
          <p className="eyebrow">KNOWLEDGE ENGINE</p>
          <h1>Calibre Library</h1>
          <p className="muted">Movement, parts, compatibility and source knowledge with evidence kept attached.</p>
        </div>
      </section>

      <PartsInventory />
      <MovementFinder />
      <MovementSearch />

      <section className="knowledge-import-card">
        <div className="knowledge-import-copy">
          <p className="eyebrow">IMPORT / UPDATE</p>
          <h2>Knowledge Engine JSON</h2>
          <p className="muted">Importing the same engine again updates matching records instead of creating another disconnected library.</p>
        </div>

        <label className="knowledge-file-picker">
          <span>{file ? file.name : 'Choose JSON file'}</span>
          <input type="file" accept="application/json,.json" onChange={chooseFile} disabled={busy} />
        </label>

        <button onClick={runImport} disabled={!file || busy}>{busy ? 'Importing…' : 'Import Knowledge Engine'}</button>

        {(busy || progress) && (
          <div className="knowledge-progress" aria-live="polite">
            <div className="knowledge-progress-row">
              <strong>{progress ? titleCase(progress.dataset) : 'Preparing'}</strong>
              <span>{progress ? `${progress.overallProcessed.toLocaleString()} / ${progress.overallTotal.toLocaleString()}` : '—'}</span>
            </div>
            <div className="knowledge-progress-track"><div className="knowledge-progress-fill" style={{ width: `${percent}%` }} /></div>
            {progress && <p>{progress.processed.toLocaleString()} of {progress.total.toLocaleString()} in this dataset · {percent}% overall</p>}
          </div>
        )}

        <p className={`knowledge-message ${message.startsWith('Import failed') ? 'error' : ''}`}>{message}</p>
      </section>

      {result && (
        <section className="knowledge-summary-card">
          <div>
            <p className="eyebrow">IMPORT COMPLETE</p>
            <h2>{result.engineName}</h2>
            <p className="muted">Version {result.engineVersion} · {result.overallTotal.toLocaleString()} records processed</p>
          </div>
          <div className="knowledge-summary-grid">
            {result.summary && typeof result.summary === 'object' && !Array.isArray(result.summary)
              ? Object.entries(result.summary as Record<string, unknown>).map(([key, value]) => (
                  <div className="knowledge-stat" key={key}><span>{titleCase(key)}</span><strong>{String(value)}</strong></div>
                ))
              : <div className="knowledge-stat"><span>Result</span><strong>{String(result.summary ?? 'Complete')}</strong></div>}
          </div>
          <p className="knowledge-batch">Batch: {result.batchKey}</p>
        </section>
      )}

      <section className="knowledge-safety-card">
        <p className="eyebrow">EVIDENCE RULES</p>
        <h2>Calibre does not treat every match as fact.</h2>
        <div className="knowledge-rule-grid">
          <div><strong>Documented</strong><p>Manufacturer, catalogue or directly sourced evidence.</p></div>
          <div><strong>Candidate</strong><p>Family, dimensional or generated leads that still need verification.</p></div>
          <div><strong>Calibre Verified</strong><p>Bench-confirmed fit, identity or measurement from your own work.</p></div>
        </div>
      </section>
    </main>
  )
}
