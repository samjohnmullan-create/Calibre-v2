import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import AuditHistoryPanel from './AuditHistoryPanel'

type ExportTable = {
  name: string
  label: string
  order: string[]
}

const exportTables: ExportTable[] = [
  { name: 'items', label: 'Items', order: ['id'] },
  { name: 'item_identity', label: 'Item identity', order: ['item_id'] },
  { name: 'passports', label: 'Passports', order: ['item_id'] },
  { name: 'item_facts', label: 'Item facts', order: ['id'] },
  { name: 'item_fact_sources', label: 'Item fact sources', order: ['item_fact_id', 'source_id'] },
  { name: 'item_relationships', label: 'Item relationships', order: ['id'] },
  { name: 'media_assets', label: 'Media manifest', order: ['id'] },
  { name: 'sources', label: 'Sources', order: ['id'] },
  { name: 'research_requests', label: 'Research requests', order: ['id'] },
  { name: 'research_findings', label: 'Research findings', order: ['id'] },
  { name: 'research_finding_sources', label: 'Research finding sources', order: ['research_finding_id', 'source_id'] },
  { name: 'acquisition_invoices', label: 'Acquisition invoices', order: ['id'] },
  { name: 'acquisition_invoice_lines', label: 'Acquisition invoice lines', order: ['id'] },
  { name: 'purchases', label: 'Purchases', order: ['id'] },
  { name: 'cost_entries', label: 'Item costs', order: ['id'] },
  { name: 'valuations', label: 'Valuations', order: ['id'] },
  { name: 'offers', label: 'Offers', order: ['id'] },
  { name: 'sales', label: 'Sales', order: ['id'] },
  { name: 'business_ledger_entries', label: 'Business ledger', order: ['id'] },
  { name: 'work_records', label: 'Work records', order: ['id'] },
  { name: 'work_events', label: 'Work events', order: ['id'] },
  { name: 'work_templates', label: 'Work templates', order: ['id'] },
  { name: 'work_template_steps', label: 'Work template steps', order: ['id'] },
  { name: 'work_checklist_steps', label: 'Work checklist steps', order: ['id'] },
  { name: 'work_part_needs', label: 'Work part needs', order: ['id'] },
  { name: 'work_qc_checks', label: 'Work QC checks', order: ['id'] },
  { name: 'measurements', label: 'Measurements', order: ['id'] },
  { name: 'timing_runs', label: 'Timing runs', order: ['id'] },
  { name: 'parts', label: 'Parts', order: ['id'] },
  { name: 'part_applications', label: 'Part applications', order: ['id'] },
  { name: 'part_allocations', label: 'Part allocations', order: ['id'] },
  { name: 'part_fit_evidence', label: 'Part fit evidence', order: ['id'] },
  { name: 'part_fit_verifications', label: 'Part fit verifications', order: ['id'] },
  { name: 'tools', label: 'Tools', order: ['id'] },
  { name: 'consumables', label: 'Consumables', order: ['id'] },
  { name: 'storage_locations', label: 'Storage locations', order: ['id'] },
  { name: 'audit_events', label: 'Audit events', order: ['id'] },
]

const exportBatchSize = 500

function isSettings() {
  return window.location.hash.replace(/\/$/, '') === '#/settings'
}

function safeTimestamp() {
  return new Date().toISOString().replace(/:/g, '-').replace(/\.\d{3}Z$/, 'Z')
}

async function sha256(text: string) {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export default function SettingsRoute() {
  const [active, setActive] = useState(isSettings)
  const [workspaceId, setWorkspaceId] = useState('')
  const [workspaceName, setWorkspaceName] = useState('Calibre workspace')
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState('')
  const [message, setMessage] = useState('')
  const [lastExport, setLastExport] = useState(() => localStorage.getItem('calibre:last-structured-export') ?? '')

  const exportScopeLabel = useMemo(() => `${exportTables.length} structured data domains`, [])

  useEffect(() => {
    const sync = () => setActive(isSettings())
    window.addEventListener('hashchange', sync)
    sync()
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  useEffect(() => {
    if (!active) return
    let cancelled = false
    ;(async () => {
      const result = await supabase.from('workspaces').select('id,name').order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (cancelled) return
      if (result.error || !result.data) {
        setMessage(`Data & Recovery unavailable: ${result.error?.message ?? 'No workspace found.'}`)
        return
      }
      setWorkspaceId(result.data.id)
      setWorkspaceName(result.data.name || 'Calibre workspace')
    })()
    return () => { cancelled = true }
  }, [active])

  async function readWholeTable(definition: ExportTable) {
    const rows: unknown[] = []
    let offset = 0

    while (true) {
      let request = supabase
        .from(definition.name)
        .select('*')
        .eq('workspace_id', workspaceId)

      for (const column of definition.order) request = request.order(column, { ascending: true })

      const result = await request.range(offset, offset + exportBatchSize - 1)
      if (result.error) throw new Error(`${definition.label}: ${result.error.message}`)
      const page = result.data ?? []
      rows.push(...page)
      if (page.length < exportBatchSize) break
      offset += exportBatchSize
    }

    return rows
  }

  async function exportStructuredBackup() {
    if (!workspaceId || exporting) return
    setExporting(true)
    setMessage('')

    try {
      const tables: Record<string, unknown[]> = {}
      const counts: Record<string, number> = {}

      for (let index = 0; index < exportTables.length; index += 1) {
        const definition = exportTables[index]
        setProgress(`Exporting ${index + 1} of ${exportTables.length}: ${definition.label}`)
        const rows = await readWholeTable(definition)
        tables[definition.name] = rows
        counts[definition.name] = rows.length
      }

      setProgress('Calculating integrity checksum…')
      const tableJson = JSON.stringify(tables)
      const checksum = await sha256(tableJson)
      const exportedAt = new Date().toISOString()
      const payload = {
        calibre_export_version: '1.0',
        export_kind: 'workspace_structured_backup',
        exported_at: exportedAt,
        workspace: {
          id: workspaceId,
          name: workspaceName,
        },
        integrity: {
          algorithm: 'SHA-256',
          tables_checksum: checksum,
        },
        scope: {
          structured_tables: exportTables.map((entry) => entry.name),
          row_counts: counts,
          includes_storage_binaries: false,
          includes_auth_credentials: false,
        },
        tables,
      }

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `calibre-workspace-backup-${safeTimestamp()}.json`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)

      localStorage.setItem('calibre:last-structured-export', exportedAt)
      setLastExport(exportedAt)
      setProgress('')
      setMessage(`Structured backup created successfully. ${Object.values(counts).reduce((sum, count) => sum + count, 0).toLocaleString()} rows exported.`)
    } catch (error) {
      setProgress('')
      setMessage(`Backup export failed: ${error instanceof Error ? error.message : 'Unknown error.'}`)
    } finally {
      setExporting(false)
    }
  }

  if (!active) return null

  return (
    <main className="settings-v2-page">
      <header className="settings-v2-heading">
        <div>
          <p className="eyebrow">SYSTEM</p>
          <h1>Settings</h1>
          <p className="muted">Business-critical controls belong here instead of being scattered through operational screens.</p>
        </div>
      </header>

      <section className="settings-v2-grid">
        <article className="settings-v2-card settings-v2-card-primary">
          <div>
            <p className="eyebrow">DATA & RECOVERY</p>
            <h2>Portable workspace backup</h2>
            <p>Export the structured Calibre records you own into one versioned JSON file. The export is paginated, includes an integrity checksum and records per-table counts.</p>
          </div>

          <div className="settings-v2-backup-facts">
            <div><span>Workspace</span><strong>{workspaceName}</strong></div>
            <div><span>Scope</span><strong>{exportScopeLabel}</strong></div>
            <div><span>Batch size</span><strong>{exportBatchSize} rows</strong></div>
            <div><span>Last export on this device</span><strong>{lastExport ? new Date(lastExport).toLocaleString('en-AU') : 'Not recorded'}</strong></div>
          </div>

          <div className="settings-v2-actions">
            <button type="button" disabled={!workspaceId || exporting} onClick={() => void exportStructuredBackup()}>{exporting ? 'Exporting…' : 'Export structured backup'}</button>
            {progress && <span>{progress}</span>}
          </div>
          {message && <p className="settings-v2-message">{message}</p>}
        </article>

        <article className="settings-v2-card">
          <p className="eyebrow">WHAT THIS BACKS UP</p>
          <h2>Business records and file manifest</h2>
          <p className="muted">Items, Passport data, research, invoices, finance, Work, QC, measurements, timing, parts, tools, storage locations and audit events are included. Media metadata and Storage paths are included as a manifest.</p>
          <div className="settings-v2-status good"><strong>Structured records</strong><span>Included</span></div>
          <div className="settings-v2-status good"><strong>Integrity checksum</strong><span>Included</span></div>
          <div className="settings-v2-status pending"><strong>Actual image/PDF binary files</strong><span>Storage archive still to build</span></div>
          <div className="settings-v2-status pending"><strong>Auth credentials</strong><span>Intentionally excluded</span></div>
        </article>

        <article className="settings-v2-card">
          <p className="eyebrow">RESTORE</p>
          <h2>Restore stays locked for now.</h2>
          <p className="muted">Creating a backup is safe. Importing one can overwrite or duplicate real business records, so Calibre will not expose a Restore button until we have tested the restore path against a disposable environment and documented the rollback procedure.</p>
          <div className="settings-v2-status pending"><strong>Restore importer</strong><span>Planned</span></div>
          <div className="settings-v2-status pending"><strong>Disposable restore drill</strong><span>Required before release gate</span></div>
        </article>

        <article className="settings-v2-card">
          <p className="eyebrow">RECOVERY MODEL</p>
          <h2>One backup is not enough.</h2>
          <p className="muted">The release target is layered recovery: versioned database migrations, managed database backups where available, Calibre portable exports, and a separate archive of private Storage files. We will test the whole chain before the main URL cutover.</p>
        </article>

        {workspaceId && <AuditHistoryPanel workspaceId={workspaceId} />}
      </section>
    </main>
  )
}
