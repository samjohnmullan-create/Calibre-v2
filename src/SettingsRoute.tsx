import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import AuditHistoryPanel from './AuditHistoryPanel'
import { exportWorkspaceStorageArchive } from './storageArchive'
import { useWorkshopSession } from './WorkshopSessionGate'
import { workspaceBackupTables, type ExportTable } from './workspaceBackupTables'

const exportBatchSize = 500
const structuredBackupVersion = '2.0'

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
  const { workspace } = useWorkshopSession()
  const workspaceId = workspace.id
  const workspaceName = workspace.name || 'Calibre workspace'
  const [active, setActive] = useState(isSettings)
  const [exporting, setExporting] = useState(false)
  const [archivingStorage, setArchivingStorage] = useState(false)
  const [progress, setProgress] = useState('')
  const [storageProgress, setStorageProgress] = useState('')
  const [message, setMessage] = useState('')
  const [lastExport, setLastExport] = useState(() => localStorage.getItem('calibre:last-structured-export') ?? '')
  const [lastStorageExport, setLastStorageExport] = useState(() => localStorage.getItem('calibre:last-storage-export') ?? '')

  const exportScopeLabel = useMemo(() => `${workspaceBackupTables.length} workspace tables`, [])

  useEffect(() => {
    const sync = () => setActive(isSettings())
    window.addEventListener('hashchange', sync)
    sync()
    return () => window.removeEventListener('hashchange', sync)
  }, [])

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

      for (let index = 0; index < workspaceBackupTables.length; index += 1) {
        const definition = workspaceBackupTables[index]
        setProgress(`Exporting ${index + 1} of ${workspaceBackupTables.length}: ${definition.label}`)
        const rows = await readWholeTable(definition)
        tables[definition.name] = rows
        counts[definition.name] = rows.length
      }

      setProgress('Calculating integrity checksum…')
      const tableJson = JSON.stringify(tables)
      const checksum = await sha256(tableJson)
      const exportedAt = new Date().toISOString()
      const payload = {
        calibre_export_version: structuredBackupVersion,
        export_kind: 'workspace_structured_backup',
        exported_at: exportedAt,
        workspace: {
          id: workspaceId,
          name: workspaceName,
          slug: workspace.slug,
          owner_id: workspace.owner_id,
        },
        integrity: {
          algorithm: 'SHA-256',
          tables_checksum: checksum,
          checksum_scope: 'JSON.stringify(tables)',
        },
        scope: {
          coverage_model: 'all current public base tables scoped by workspace_id',
          structured_table_count: workspaceBackupTables.length,
          structured_tables: workspaceBackupTables.map((entry) => entry.name),
          row_counts: counts,
          includes_workspace_membership_metadata: true,
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
      setMessage(`Structured backup v${structuredBackupVersion} created successfully. ${workspaceBackupTables.length} tables and ${Object.values(counts).reduce((sum, count) => sum + count, 0).toLocaleString()} rows exported.`)
    } catch (error) {
      setProgress('')
      setMessage(`Backup export failed: ${error instanceof Error ? error.message : 'Unknown error.'}`)
    } finally {
      setExporting(false)
    }
  }

  async function exportStorageArchive() {
    if (!workspaceId || archivingStorage) return
    setArchivingStorage(true)
    setStorageProgress('')
    setMessage('')
    try {
      const result = await exportWorkspaceStorageArchive({
        workspaceId,
        workspaceName,
        onProgress: setStorageProgress,
      })
      localStorage.setItem('calibre:last-storage-export', result.exportedAt)
      setLastStorageExport(result.exportedAt)
      setStorageProgress('')
      setMessage(`Storage archive created successfully. ${result.fileCount.toLocaleString()} files and ${(result.totalBytes / 1024 / 1024).toFixed(1)} MB of source data were archived with per-file SHA-256 checksums.`)
    } catch (error) {
      setStorageProgress('')
      setMessage(`Storage archive failed: ${error instanceof Error ? error.message : 'Unknown error.'}`)
    } finally {
      setArchivingStorage(false)
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
            <p>Create two owner-controlled files: a versioned JSON export of every current workspace-scoped table and a TAR archive containing the Storage binaries referenced by those records.</p>
          </div>

          <div className="settings-v2-backup-facts">
            <div><span>Workspace</span><strong>{workspaceName}</strong></div>
            <div><span>Structured scope</span><strong>{exportScopeLabel}</strong></div>
            <div><span>Backup format</span><strong>v{structuredBackupVersion}</strong></div>
            <div><span>Last structured export</span><strong>{lastExport ? new Date(lastExport).toLocaleString('en-AU') : 'Not recorded'}</strong></div>
            <div><span>Last Storage export</span><strong>{lastStorageExport ? new Date(lastStorageExport).toLocaleString('en-AU') : 'Not recorded'}</strong></div>
          </div>

          <div className="settings-v2-actions">
            <button type="button" disabled={!workspaceId || exporting || archivingStorage} onClick={() => void exportStructuredBackup()}>{exporting ? 'Exporting…' : 'Export structured backup'}</button>
            <button type="button" className="secondary" disabled={!workspaceId || exporting || archivingStorage} onClick={() => void exportStorageArchive()}>{archivingStorage ? 'Archiving Storage…' : 'Export Storage archive'}</button>
            {progress && <span>{progress}</span>}
            {storageProgress && <span>{storageProgress}</span>}
          </div>
          {message && <p className="settings-v2-message">{message}</p>}
        </article>

        <article className="settings-v2-card">
          <p className="eyebrow">WHAT THIS BACKS UP</p>
          <h2>Records plus the real files</h2>
          <p className="muted">The JSON now covers every current workspace-scoped base table, including workshop sessions, induction, diagnosis, job-plan history, component state, Library evidence, customer publications and acquisition-cost lineage. The separate TAR archive preserves referenced Storage files with SHA-256 checksums.</p>
          <div className="settings-v2-status good"><strong>All workspace-scoped structured tables</strong><span>{workspaceBackupTables.length} included</span></div>
          <div className="settings-v2-status good"><strong>Workshop sessions & diagnostic history</strong><span>Included</span></div>
          <div className="settings-v2-status good"><strong>Library documents & page evidence</strong><span>Included</span></div>
          <div className="settings-v2-status good"><strong>Customer publication records</strong><span>Included</span></div>
          <div className="settings-v2-status good"><strong>Acquisition & receiving lineage</strong><span>Included</span></div>
          <div className="settings-v2-status good"><strong>Physical-storage move history</strong><span>Included</span></div>
          <div className="settings-v2-status good"><strong>Structured integrity checksum</strong><span>Included</span></div>
          <div className="settings-v2-status good"><strong>Referenced binary files</strong><span>Separate TAR archive</span></div>
          <div className="settings-v2-status good"><strong>Per-file binary checksums</strong><span>Included in TAR manifest</span></div>
          <div className="settings-v2-status pending"><strong>Auth credentials</strong><span>Intentionally excluded</span></div>
        </article>

        <article className="settings-v2-card">
          <p className="eyebrow">RESTORE</p>
          <h2>Restore stays locked for now.</h2>
          <p className="muted">Creating backups is safe. Importing them can overwrite or duplicate real business records, so Calibre will not expose a Restore button until we have tested the v{structuredBackupVersion} restore path against a disposable environment and documented the rollback procedure.</p>
          <div className="settings-v2-status pending"><strong>Restore importer</strong><span>Planned</span></div>
          <div className="settings-v2-status pending"><strong>Disposable restore drill</strong><span>Required before release gate</span></div>
        </article>

        <article className="settings-v2-card">
          <p className="eyebrow">RECOVERY MODEL</p>
          <h2>One backup is not enough.</h2>
          <p className="muted">The release target is layered recovery: versioned database migrations, managed database backups where available, Calibre portable exports, and an owner-controlled archive of Storage files. The restore drill is still the test that decides whether recovery is actually proven.</p>
        </article>

        {workspaceId && <AuditHistoryPanel workspaceId={workspaceId} />}
      </section>
    </main>
  )
}
