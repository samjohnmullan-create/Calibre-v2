import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './lib/supabase'

type Props = { open: boolean; onClose: () => void }
type SearchKind = 'item' | 'work' | 'part' | 'invoice'
type SearchResult = {
  key: string
  kind: SearchKind
  title: string
  subtitle: string
  meta?: string
  href: string
}

type ItemRow = { id: string; item_number: number; title: string; type: string; purpose: string; status: string; notes: string }
type IdentityRow = { item_id: string; maker: string; model: string; reference: string; serial: string; movement_markings: string }
type WorkRow = { id: string; item_id: string; work_number: number; title: string; status: string; next_action: string; diagnosis: string }
type PartRow = { id: string; part_type: string; manufacturer: string; reference: string; description: string; condition: string; quantity: number }
type InvoiceRow = { id: string; vendor_name: string; invoice_number: string; original_filename: string; extraction_status: string }

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function cleanSearchTerm(value: string) {
  return value.trim().replace(/[,%()]/g, ' ').replace(/\s+/g, ' ').slice(0, 80)
}

export default function GlobalSearch({ open, onClose }: Props) {
  const [workspaceId, setWorkspaceId] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const requestRef = useRef(0)

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  useEffect(() => {
    if (!open || workspaceId) return
    let active = true
    ;(async () => {
      const { data, error } = await supabase.from('workspaces').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (!active) return
      if (error || !data) {
        setMessage(error?.message ?? 'No workspace found.')
        return
      }
      setWorkspaceId(data.id)
    })()
    return () => { active = false }
  }, [open, workspaceId])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setResults([])
      setMessage('')
    }
  }, [open])

  useEffect(() => {
    if (!open || !workspaceId) return
    const term = cleanSearchTerm(query)
    if (term.length < 2) {
      setResults([])
      setLoading(false)
      setMessage(term ? 'Type at least 2 characters.' : '')
      return
    }

    const requestId = ++requestRef.current
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setMessage('')
      const pattern = `%${term}%`
      const numeric = /^#?\d+$/.test(term) ? Number(term.replace('#', '')) : null

      const itemQuery = supabase.from('items')
        .select('id,item_number,title,type,purpose,status,notes')
        .eq('workspace_id', workspaceId)
        .is('archived_at', null)
        .or(`title.ilike.${pattern},notes.ilike.${pattern},type.ilike.${pattern},purpose.ilike.${pattern}`)
        .limit(12)

      const identityQuery = supabase.from('item_identity')
        .select('item_id,maker,model,reference,serial,movement_markings')
        .eq('workspace_id', workspaceId)
        .or(`maker.ilike.${pattern},model.ilike.${pattern},reference.ilike.${pattern},serial.ilike.${pattern},movement_markings.ilike.${pattern}`)
        .limit(12)

      const workQuery = supabase.from('work_records')
        .select('id,item_id,work_number,title,status,next_action,diagnosis')
        .eq('workspace_id', workspaceId)
        .or(`title.ilike.${pattern},next_action.ilike.${pattern},diagnosis.ilike.${pattern}`)
        .limit(12)

      const partQuery = supabase.from('parts')
        .select('id,part_type,manufacturer,reference,description,condition,quantity')
        .eq('workspace_id', workspaceId)
        .or(`part_type.ilike.${pattern},manufacturer.ilike.${pattern},reference.ilike.${pattern},description.ilike.${pattern}`)
        .limit(12)

      const invoiceQuery = supabase.from('acquisition_invoices')
        .select('id,vendor_name,invoice_number,original_filename,extraction_status')
        .eq('workspace_id', workspaceId)
        .or(`vendor_name.ilike.${pattern},invoice_number.ilike.${pattern},original_filename.ilike.${pattern}`)
        .limit(10)

      const exactItemQuery = numeric == null
        ? Promise.resolve({ data: [], error: null } as const)
        : supabase.from('items').select('id,item_number,title,type,purpose,status,notes').eq('workspace_id', workspaceId).eq('item_number', numeric).limit(1)

      const exactWorkQuery = numeric == null
        ? Promise.resolve({ data: [], error: null } as const)
        : supabase.from('work_records').select('id,item_id,work_number,title,status,next_action,diagnosis').eq('workspace_id', workspaceId).eq('work_number', numeric).limit(1)

      const [itemsResult, identitiesResult, workResult, partsResult, invoicesResult, exactItemsResult, exactWorksResult] = await Promise.all([
        itemQuery, identityQuery, workQuery, partQuery, invoiceQuery, exactItemQuery, exactWorkQuery,
      ])

      if (requestId !== requestRef.current) return
      setLoading(false)

      const firstError = itemsResult.error ?? identitiesResult.error ?? workResult.error ?? partsResult.error ?? invoicesResult.error ?? exactItemsResult.error ?? exactWorksResult.error
      if (firstError) {
        setMessage(`Search failed: ${firstError.message}`)
        setResults([])
        return
      }

      const itemMap = new Map<string, ItemRow>()
      ;([...(exactItemsResult.data ?? []), ...(itemsResult.data ?? [])] as ItemRow[]).forEach((row) => itemMap.set(row.id, row))

      const identityRows = (identitiesResult.data ?? []) as IdentityRow[]
      const missingItemIds = [...new Set(identityRows.map((row) => row.item_id).filter((id) => !itemMap.has(id)))]
      if (missingItemIds.length) {
        const identityItems = await supabase.from('items')
          .select('id,item_number,title,type,purpose,status,notes')
          .eq('workspace_id', workspaceId)
          .in('id', missingItemIds)
        if (requestId !== requestRef.current) return
        if (!identityItems.error) (identityItems.data ?? []).forEach((row) => itemMap.set(row.id, row as ItemRow))
      }

      const identityByItem = new Map(identityRows.map((row) => [row.item_id, row]))
      const itemResults: SearchResult[] = [...itemMap.values()].map((row) => {
        const identity = identityByItem.get(row.id)
        const identityText = [identity?.maker, identity?.model, identity?.reference, identity?.serial].filter(Boolean).join(' · ')
        return {
          key: `item-${row.id}`,
          kind: 'item',
          title: `#${row.item_number} · ${row.title}`,
          subtitle: identityText || `${titleCase(row.type)} · ${titleCase(row.purpose)}`,
          meta: titleCase(row.status),
          href: `#/items/${encodeURIComponent(row.id)}`,
        }
      })

      const seenWork = new Map<string, WorkRow>()
      ;([...(exactWorksResult.data ?? []), ...(workResult.data ?? [])] as WorkRow[]).forEach((row) => seenWork.set(row.id, row))
      const workResults: SearchResult[] = [...seenWork.values()].map((row) => ({
        key: `work-${row.id}`,
        kind: 'work',
        title: `Work #${row.work_number} · ${row.title}`,
        subtitle: row.next_action || row.diagnosis || 'No next action recorded',
        meta: titleCase(row.status),
        href: `#/work/${encodeURIComponent(row.id)}`,
      }))

      const partResults: SearchResult[] = ((partsResult.data ?? []) as PartRow[]).map((row) => ({
        key: `part-${row.id}`,
        kind: 'part',
        title: row.description || titleCase(row.part_type),
        subtitle: [row.manufacturer, row.reference, titleCase(row.part_type)].filter(Boolean).join(' · '),
        meta: `${row.quantity} in stock`,
        href: '#/items?view=parts',
      }))

      const invoiceResults: SearchResult[] = ((invoicesResult.data ?? []) as InvoiceRow[]).map((row) => ({
        key: `invoice-${row.id}`,
        kind: 'invoice',
        title: row.vendor_name || row.original_filename,
        subtitle: row.invoice_number ? `Invoice ${row.invoice_number}` : row.original_filename,
        meta: titleCase(row.extraction_status),
        href: '#/intake',
      }))

      const combined = [...itemResults, ...workResults, ...partResults, ...invoiceResults].slice(0, 36)
      setResults(combined)
      setMessage(combined.length ? '' : 'No matching Calibre records.')
    }, 180)

    return () => window.clearTimeout(timer)
  }, [open, workspaceId, query])

  const grouped = useMemo(() => {
    return {
      item: results.filter((result) => result.kind === 'item'),
      work: results.filter((result) => result.kind === 'work'),
      part: results.filter((result) => result.kind === 'part'),
      invoice: results.filter((result) => result.kind === 'invoice'),
    }
  }, [results])

  if (!open) return null

  function openResult(result: SearchResult) {
    if (result.kind === 'part') {
      window.location.hash = '#/items'
      window.setTimeout(() => window.dispatchEvent(new CustomEvent('calibre:inventory-view', { detail: 'parts' })), 40)
    } else {
      window.location.hash = result.href
    }
    onClose()
  }

  return (
    <div className="global-search-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="global-search-sheet" role="dialog" aria-modal="true" aria-label="Search Calibre">
        <div className="global-search-input-row">
          <span aria-hidden="true">⌕</span>
          <input ref={inputRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Items, Work, parts, invoices…" aria-label="Search all Calibre records" />
          <button type="button" className="secondary small" onClick={onClose}>Esc</button>
        </div>

        {!query.trim() && (
          <div className="global-search-empty">
            <p className="eyebrow">GLOBAL SEARCH</p>
            <h2>Find anything without hunting through menus.</h2>
            <p>Search Item numbers, titles, makers, references, serials, Work numbers, diagnosis, parts and invoices.</p>
          </div>
        )}

        {loading && <p className="global-search-message">Searching…</p>}
        {!loading && message && <p className="global-search-message">{message}</p>}

        {!loading && results.length > 0 && (
          <div className="global-search-results">
            {(['item', 'work', 'part', 'invoice'] as SearchKind[]).map((kind) => {
              const rows = grouped[kind]
              if (!rows.length) return null
              return (
                <section className="global-search-group" key={kind}>
                  <div className="global-search-group-heading"><span>{kind === 'item' ? 'Items' : kind === 'work' ? 'Work' : kind === 'part' ? 'Parts' : 'Invoices'}</span><strong>{rows.length}</strong></div>
                  {rows.map((result) => (
                    <button key={result.key} type="button" className="global-search-result" onClick={() => openResult(result)}>
                      <span className={`global-search-kind kind-${result.kind}`} aria-hidden="true">{result.kind === 'item' ? 'I' : result.kind === 'work' ? 'W' : result.kind === 'part' ? 'P' : '£'}</span>
                      <span className="global-search-result-copy"><strong>{result.title}</strong><small>{result.subtitle}</small></span>
                      {result.meta && <span className="global-search-meta">{result.meta}</span>}
                    </button>
                  ))}
                </section>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
