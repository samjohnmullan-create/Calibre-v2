import { ChangeEvent, useMemo, useState } from 'react'
import { importKnowledgeEngine } from './lib/knowledge-import'
import MovementFinder from './MovementFinder'
import MovementSearch from './MovementSearch'
import CompatibilityIntelligence from './CompatibilityIntelligence'
import MovementIntelligenceStudio from './MovementIntelligenceStudio'

type LibraryMode = 'search' | 'identify' | 'compatibility' | 'intelligence'

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
  const [mode, setMode] = useState<LibraryMode>('search')
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
    <main className="knowledge-page library-v2-page">
      <section className="library-v2-heading">
        <div>
          <p className="eyebrow">LIBRARY</p>
          <h1>Research</h1>
          <p className="muted">Search known movements, identify an unknown calibre, inspect compatibility evidence, or author movement-specific workshop intelligence.</p>
        </div>
      </section>

      <section className="library-v2-intro">
        <div className="library-v2-intro-card">
          <p className="eyebrow">TECHNICAL KNOWLEDGE</p>
          <h2>Start with the question, not the tool.</h2>
          <p className="muted">If you know the movement, search it. If you only have clues from the bench, identify it. Compatibility remains evidence-led rather than guessed.</p>
        </div>
        <div className="library-v2-evidence">
          <p className="eyebrow">CONFIDENCE</p>
          <h3>Evidence stays visible.</h3>
          <div className="library-v2-evidence-grid">
            <div><strong>Documented</strong><span>Manufacturer, catalogue or directly sourced.</span></div>
            <div><strong>Candidate</strong><span>A lead requiring confirmation.</span></div>
            <div><strong>Calibre Verified</strong><span>Confirmed from your own bench work.</span></div>
          </div>
        </div>
      </section>

      <nav className="library-v2-modebar" aria-label="Research modes">
        <button type="button" className={mode === 'search' ? 'active' : ''} onClick={() => setMode('search')}>
          <strong>Search movements</strong><span>I know a maker, calibre, family or alias.</span>
        </button>
        <button type="button" className={mode === 'identify' ? 'active' : ''} onClick={() => setMode('identify')}>
          <strong>Identify movement</strong><span>I have markings, measurements or bench clues.</span>
        </button>
        <button type="button" className={mode === 'compatibility' ? 'active' : ''} onClick={() => setMode('compatibility')}>
          <strong>Compatibility</strong><span>Inspect documented and bench-confirmed relationships.</span>
        </button>
        <button type="button" className={mode === 'intelligence' ? 'active' : ''} onClick={() => setMode('intelligence')}>
          <strong>Movement intelligence</strong><span>Author sourced calibre-specific bench guidance.</span>
        </button>
      </nav>

      <section className="library-v2-panel">
        {mode === 'search' && <MovementSearch />}
        {mode === 'identify' && <MovementFinder />}
        {mode === 'compatibility' && <CompatibilityIntelligence />}
        {mode === 'intelligence' && <MovementIntelligenceStudio />}
      </section>

      <details className="library-v2-admin">
        <summary>Library administration</summary>
        <section className="knowledge-import-card">
          <div className="knowledge-import-copy">
            <p className="eyebrow">IMPORT / UPDATE</p>
            <h2>Knowledge Engine JSON</h2>
            <p className="muted">Administrative import is kept out of the everyday research flow. Re-importing the same engine updates matching records.</p>
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
      </details>
    </main>
  )
}
