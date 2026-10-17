import { useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import './research-workspace.css'

type Finding = {
  proposed_destination: string | null
  proposed_field: string | null
  proposal_status: string
  confidence: string
}

type ResearchRequest = {
  id?: string
  request_type: string
  requested_scope: Record<string, unknown>
}

type ResearchDocument = {
  key: string
  title: string
  url: string
  documentType: string
  publisher: string
  referenceText: string
  pageFrom: number | null
  pageTo: number | null
}

function autonomous(request: ResearchRequest | null) {
  const value = request?.requested_scope?.autonomous_research
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function domain(request: ResearchRequest | null) {
  const value = request?.requested_scope?.domain_ingestion
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function countCompatibility(request: ResearchRequest | null) {
  const ingestion = domain(request)
  const compatibility = ingestion?.compatibility
  if (!compatibility || typeof compatibility !== 'object') return 0
  const value = compatibility as Record<string, unknown>
  return (Array.isArray(value.movements) ? value.movements.length : 0) + (Array.isArray(value.parts) ? value.parts.length : 0)
}

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function page(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? Math.max(1, Math.round(value)) : null }

function researchDocuments(request: ResearchRequest | null): ResearchDocument[] {
  const raw = domain(request)?.technical_documents
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') return []
    const row = entry as Record<string, unknown>
    const title = text(row.title) || text(row.name) || `Research document ${index + 1}`
    const url = text(row.url) || text(row.source_url) || text(row.link)
    const referenceText = text(row.reference_text) || text(row.reference) || text(row.notes) || text(row.summary)
    const documentType = text(row.document_type) || text(row.type) || 'technical reference'
    const publisher = text(row.publisher) || text(row.source)
    const pageFrom = page(row.page_from) || page(row.page) || page(row.page_number)
    const pageTo = page(row.page_to) || pageFrom
    return [{ key: `${index}-${url || title}`, title, url, referenceText, documentType, publisher, pageFrom, pageTo }]
  })
}

export default function ResearchOutcomePanel({ request, findings, sourceCount }: { request: ResearchRequest | null; findings: Finding[]; sourceCount: number }) {
  const [saving, setSaving] = useState('')
  const [saved, setSaved] = useState<Record<string, boolean>>({})
  const [message, setMessage] = useState('')
  const documents = useMemo(() => researchDocuments(request), [request])

  if (!request) return null
  const result = autonomous(request)
  const unresolved = Array.isArray(result?.unresolved) ? result?.unresolved.filter((value): value is string => typeof value === 'string' && Boolean(value.trim())) : []
  const pending = findings.filter((finding) => finding.proposed_destination && finding.proposed_field && finding.proposal_status === 'pending').length
  const applied = findings.filter((finding) => finding.proposal_status === 'applied').length
  const compatibility = countCompatibility(request)
  const summary = typeof result?.summary === 'string' ? result.summary : ''

  async function saveReference(document: ResearchDocument) {
    if (!request?.id || saving) return
    setSaving(document.key)
    setMessage('Saving reference to Calibre Library…')
    try {
      const context = await supabase.from('research_requests')
        .select('workspace_id,item_id,work_id')
        .eq('id', request.id)
        .single()
      if (context.error || !context.data) throw new Error(context.error?.message || 'Research context could not be loaded.')

      const existing = document.url ? await supabase.from('knowledge_technical_documents')
        .select('id')
        .eq('workspace_id', context.data.workspace_id)
        .eq('url', document.url)
        .maybeSingle() : { data: null, error: null }
      if (existing.error) throw new Error(existing.error.message)

      let documentId = existing.data?.id as string | undefined
      if (!documentId) {
        const inserted = await supabase.from('knowledge_technical_documents').insert({
          workspace_id: context.data.workspace_id,
          item_id: context.data.item_id,
          work_id: context.data.work_id,
          research_request_id: request.id,
          title: document.title,
          document_type: document.documentType,
          document_scope: 'technical',
          publisher: document.publisher,
          url: document.url,
          reference_text: document.referenceText,
          notes: 'Saved from Calibre Research. External reference retained as evidence; no source file was copied.',
          origin_kind: 'research',
          verification_status: 'candidate',
          import_batch: 'research-library',
        }).select('id').single()
        if (inserted.error || !inserted.data) throw new Error(inserted.error?.message || 'Library record was not returned.')
        documentId = inserted.data.id
      }

      const linked = await supabase.from('knowledge_document_links').upsert({
        workspace_id: context.data.workspace_id,
        document_id: documentId,
        item_id: context.data.item_id,
        work_id: context.data.work_id,
        research_request_id: request.id,
        link_kind: 'research_evidence',
        relevance_note: document.referenceText || `Found during ${request.request_type} research.`,
        page_from: document.pageFrom,
        page_to: document.pageTo,
      }, { onConflict: 'document_id,item_id,work_id,research_request_id,link_kind' })
      if (linked.error) throw new Error(linked.error.message)

      setSaved((current) => ({ ...current, [document.key]: true }))
      setMessage('✓ Reference saved to Calibre Library and linked to this research.')
    } catch (error) {
      setMessage(`Reference could not be saved: ${error instanceof Error ? error.message : 'Unknown error.'}`)
    } finally {
      setSaving('')
    }
  }

  return <section className="research-outcome-panel">
    <div className="bench-guided-heading"><div><p className="eyebrow">RESEARCH OUTCOME</p><strong>What Calibre found and what needs your decision</strong></div><span>{findings.length} findings</span></div>
    {summary && <p className="research-outcome-summary">{summary}</p>}
    <div className="research-outcome-stats">
      <div><strong>{pending}</strong><span>Proposed updates</span></div>
      <div><strong>{applied}</strong><span>Confirmed updates</span></div>
      <div><strong>{documents.length}</strong><span>Documents found</span></div>
      <div><strong>{compatibility}</strong><span>Parts / compatibility</span></div>
      <div><strong>{sourceCount}</strong><span>Sources</span></div>
      <div><strong>{unresolved.length}</strong><span>Research gaps</span></div>
    </div>

    {documents.length > 0 && <div className="research-gaps">
      <div><p className="eyebrow">DOCUMENTS FOUND</p><strong>Keep useful research as reusable Calibre evidence</strong></div>
      <div className="bench-documents-list">{documents.map((document) => <div className="bench-document-row" key={document.key}>
        <div><strong>{document.title}</strong><small>{document.documentType}{document.publisher ? ` · ${document.publisher}` : ''}{document.pageFrom ? ` · p.${document.pageFrom}${document.pageTo && document.pageTo !== document.pageFrom ? `–${document.pageTo}` : ''}` : ''}</small>{document.referenceText && <small>{document.referenceText}</small>}</div>
        <div className="bench-guided-actions">{document.url && <a className="secondary" href={document.url} target="_blank" rel="noreferrer">Open source</a>}<button type="button" className="secondary" disabled={Boolean(saving) || saved[document.key]} onClick={() => void saveReference(document)}>{saved[document.key] ? 'Saved' : saving === document.key ? 'Saving…' : 'Save to Library'}</button></div>
      </div>)}</div>
      <p className="bench-guided-help">Saving keeps the citation, research context and page range. Calibre does not copy an external file unless you explicitly upload or archive it later.</p>
    </div>}

    {unresolved.length > 0 && <div className="research-gaps">
      <div><p className="eyebrow">RESEARCH GAPS</p><strong>What would make the next research run stronger</strong></div>
      <ul>{unresolved.map((gap, index) => <li key={`${index}-${gap.slice(0, 24)}`}>{gap}</li>)}</ul>
    </div>}
    {message && <p className="bench-guided-message" role="status" aria-live="polite">{message}</p>}
  </section>
}
