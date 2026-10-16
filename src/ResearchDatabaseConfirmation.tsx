import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

type DomainIngestion = {
  request_type?: string
  documents_stored?: number
  compatibility_edges_added?: number
  part_applications_added?: number
  market_updated?: boolean
  applied_passport_fields?: string[]
  technical_documents?: unknown[]
  compatibility?: { movements?: unknown[]; parts?: unknown[] }
  market?: Record<string, unknown> | null
}

type ResearchRow = {
  id: string
  request_type: string
  requested_at: string
  requested_scope: Record<string, unknown>
}

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export default function ResearchDatabaseConfirmation({ workspaceId, itemId, workId, refreshKey = 0 }: { workspaceId: string; itemId: string; workId?: string | null; refreshKey?: number }) {
  const [row, setRow] = useState<ResearchRow | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      let query = supabase.from('research_requests')
        .select('id,request_type,requested_at,requested_scope')
        .eq('workspace_id', workspaceId)
        .eq('item_id', itemId)
        .eq('status', 'complete')
      if (workId) query = query.eq('work_id', workId)
      const result = await query.order('requested_at', { ascending: false }).limit(1).maybeSingle()
      if (!cancelled && !result.error) setRow((result.data ?? null) as ResearchRow | null)
    }
    void load()
    return () => { cancelled = true }
  }, [workspaceId, itemId, workId, refreshKey])

  if (!row) return null
  const raw = row.requested_scope.domain_ingestion
  if (!raw || typeof raw !== 'object') return null
  const ingestion = raw as DomainIngestion
  const passportFields = Array.isArray(ingestion.applied_passport_fields) ? ingestion.applied_passport_fields : []
  const documents = Number(ingestion.documents_stored ?? 0)
  const movementEdges = Number(ingestion.compatibility_edges_added ?? 0)
  const partApps = Number(ingestion.part_applications_added ?? 0)
  const market = Boolean(ingestion.market_updated)
  const anyWrite = passportFields.length > 0 || documents > 0 || movementEdges > 0 || partApps > 0 || market

  if (!anyWrite) return <section className="bench-documents-panel">
    <div className="bench-guided-heading"><div><p className="eyebrow">DATABASE CONFIRMATION</p><strong>No canonical data was written by the latest research run</strong></div></div>
    <p className="bench-guided-help">Research findings were saved as evidence, but this run did not add Passport fields, compatibility records, stored manuals or Market/Sales data.</p>
  </section>

  return <section className="bench-documents-panel">
    <div className="bench-guided-heading"><div><p className="eyebrow">DATABASE CONFIRMATION</p><strong>Research updated Calibre</strong></div><span className="status-pill status-complete">Confirmed</span></div>
    <p className="bench-guided-help">Latest {titleCase(row.request_type)} research · {new Date(row.requested_at).toLocaleString('en-AU')}</p>
    <div className="bench-documents-list">
      {passportFields.length > 0 && <div className="bench-document-row"><div><strong>Passport technical details</strong><small>Saved: {passportFields.map(titleCase).join(', ')}</small></div><span className="status-pill status-complete">{passportFields.length}</span></div>}
      {documents > 0 && <div className="bench-document-row"><div><strong>Technical documents</strong><small>{documents} server cop{documents === 1 ? 'y' : 'ies'} stored and attached.</small></div><span className="status-pill status-complete">{documents}</span></div>}
      {movementEdges > 0 && <div className="bench-document-row"><div><strong>Movement compatibility</strong><small>{movementEdges} research candidate relationship{movementEdges === 1 ? '' : 's'} added.</small></div><span className="status-pill status-complete">{movementEdges}</span></div>}
      {partApps > 0 && <div className="bench-document-row"><div><strong>Part compatibility</strong><small>{partApps} research candidate part application{partApps === 1 ? '' : 's'} added.</small></div><span className="status-pill status-complete">{partApps}</span></div>}
      {market && <div className="bench-document-row"><div><strong>Market / Sales</strong><small>A valuation snapshot and eligible draft Sale data were updated.</small></div><span className="status-pill status-complete">Updated</span></div>}
    </div>
  </section>
}
