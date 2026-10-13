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
  rank: number
}

type SearchIndexRow = {
  kind: SearchKind
  record_id: string
  item_id: string | null
  record_number: number | null
  title: string
  subtitle: string
  meta: string
  href: string
}

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function cleanSearchTerm(value: string) {
  return value.trim().replace(/[,%()]/g, ' ').replace(/\s+/g, ' ').slice(0, 80)
}

function scoreResult(row: SearchIndexRow, term: string, numeric: number | null) {
  if (numeric != null && row.record_number === numeric) return row.kind === 'item' ? 1000 : row.kind === 'work' ? 990 : 900
  const needle = term.toLowerCase()
  const title = row.title.toLowerCase()
  const subtitle = row.subtitle.toLowerCase()
  const base = row.kind === 'item' ? 500 : row.kind === 'work' ? 450 : row.kind === 'part' ? 400 : 350
  if (title === needle) return base + 300
  if (title.startsWith(needle) || title.includes(` · ${needle}`)) return base + 220
  if (title.includes(needle)) return base + 160
  if (subtitle.includes(needle)) return base + 100
  return base
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
      requestRef.current += 1
      setQuery('')
      setResults([])
      setMessage('')
      setLoading(false)
    }
  }, [open])

  useEffect(() => {
    if (!open || !workspaceId) return
    const term = cleanSearchTerm(query)
    if (term.length < 2) {
      requestRef.current += 1
      setResults([])
      setLoading(false)
      setMessage(term ? 'Type at least 2 characters.' : '')
      return
    }

    const requestId = ++requestRef.current
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setMessage('')

      const numeric = /^#?\d+$/.test(term) ? Number(term.replace('#', '')) : null
      const searchTerm = numeric == null ? term.toLowerCase() : term.replace('#', '')
      const pattern = `%${searchTerm}%`
      const fields = 'kind,record_id,item_id,record_number,title,subtitle,meta,href'

      function categoryQuery(kind: SearchKind, limit: number) {
        let request = supabase
          .from('calibre_search_index')
          .select(fields)
          .eq('workspace_id', workspaceId)
          .eq('kind', kind)

        if (numeric != null && (kind === 'item' || kind === 'work')) {
          request = request.or(`record_number.eq.${numeric},search_text.ilike.${pattern}`)
        } else {
          request = request.ilike('search_text', pattern)
        }
        return request.limit(limit)
      }

      const [itemsResult, workResult, partsResult, invoicesResult] = await Promise.all([
        categoryQuery('item', 12),
        categoryQuery('work', 12),
        categoryQuery('part', 12),
        categoryQuery('invoice', 10),
      ])

      if (requestId !== requestRef.current) return
      setLoading(false)

      const error = itemsResult.error ?? workResult.error ?? partsResult.error ?? invoicesResult.error
      if (error) {
        setMessage(`Search failed: ${error.message}`)
        setResults([])
        return
      }

      const rows = [
        ...(itemsResult.data ?? []),
        ...(workResult.data ?? []),
        ...(partsResult.data ?? []),
        ...(invoicesResult.data ?? []),
      ] as SearchIndexRow[]

      const mapped = rows
        .map((row) => ({
          key: `${row.kind}-${row.record_id}`,
          kind: row.kind,
          title: row.title,
          subtitle: row.subtitle,
          meta: row.meta ? titleCase(row.meta) : undefined,
          href: row.href,
          rank: scoreResult(row, searchTerm, numeric),
        }))
        .sort((a, b) => b.rank - a.rank || a.title.localeCompare(b.title))
        .slice(0, 36)

      setResults(mapped)
      setMessage(mapped.length ? '' : 'No matching Calibre records.')
    }, 180)

    return () => window.clearTimeout(timer)
  }, [open, workspaceId, query])

  const grouped = useMemo(() => ({
    item: results.filter((result) => result.kind === 'item'),
    work: results.filter((result) => result.kind === 'work'),
    part: results.filter((result) => result.kind === 'part'),
    invoice: results.filter((result) => result.kind === 'invoice'),
  }), [results])

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
