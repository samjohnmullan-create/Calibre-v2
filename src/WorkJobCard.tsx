import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import WorkWorkspace from './WorkWorkspace'
import './work-job-card.css'

type WorkStatus = 'queued' | 'ready' | 'on_bench' | 'waiting' | 'qc' | 'complete' | 'cancelled'
type WorkSummary = {
  id: string
  work_number: number
  title: string
  status: WorkStatus
  opened_at: string
}

function statusLabel(status: WorkStatus) {
  return status === 'qc' ? 'Verification' : status.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export default function WorkJobCard({ workspaceId, itemId, focusWorkId }: { workspaceId: string; itemId: string; focusWorkId?: string | null }) {
  const [work, setWork] = useState<WorkSummary[]>([])
  const [selectedWorkId, setSelectedWorkId] = useState(focusWorkId ?? '')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function loadWork(preferredId?: string) {
    if (!workspaceId || !itemId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('work_records')
      .select('id,work_number,title,status,opened_at')
      .eq('workspace_id', workspaceId)
      .eq('item_id', itemId)
      .order('work_number', { ascending: false })
    setLoading(false)
    if (error) {
      setMessage(`Work could not be loaded: ${error.message}`)
      return
    }
    const rows = (data ?? []) as WorkSummary[]
    setWork(rows)
    const nextId = preferredId && rows.some((row) => row.id === preferredId)
      ? preferredId
      : focusWorkId && rows.some((row) => row.id === focusWorkId)
        ? focusWorkId
        : rows[0]?.id ?? ''
    setSelectedWorkId(nextId)
    setMessage('')
  }

  useEffect(() => { void loadWork(focusWorkId ?? undefined) }, [workspaceId, itemId, focusWorkId])

  async function startWork() {
    if (saving) return
    setSaving(true)
    setMessage('Creating workshop job…')
    const { data, error } = await supabase.rpc('start_work', {
      p_workspace_id: workspaceId,
      p_item_id: itemId,
      p_type: 'assessment',
      p_title: 'Workshop job',
      p_template_id: null,
    })
    setSaving(false)
    if (error) {
      setMessage(`Workshop job could not be started: ${error.message}`)
      return
    }
    const created = (Array.isArray(data) ? data[0] : data) as { id?: string } | null
    await loadWork(created?.id)
    window.dispatchEvent(new CustomEvent('calibre:work-changed', { detail: { workId: created?.id ?? '' } }))
  }

  if (loading) return <div className="loading-card">Loading Work…</div>

  if (!selectedWorkId) {
    return (
      <section className="section-card work-job-empty">
        <div><p className="eyebrow">WORKSHOP</p><h3>No workshop job yet</h3><p className="muted">Start with Workshop Induction. Calibre will record how the watch arrived before a repair plan is chosen.</p></div>
        <button type="button" onClick={() => void startWork()} disabled={saving}>{saving ? 'Creating…' : 'Start Workshop Job'}</button>
        {message && <p className="work-job-message">{message}</p>}
      </section>
    )
  }

  return (
    <div className="work-job-shell work-job-workspace-host">
      {work.length > 1 && (
        <label className="work-job-switcher">Work record
          <select value={selectedWorkId} onChange={(event) => setSelectedWorkId(event.target.value)}>
            {work.map((record) => <option key={record.id} value={record.id}>#{record.work_number} · {record.title} · {statusLabel(record.status)}</option>)}
          </select>
        </label>
      )}
      {message && <p className="work-job-message">{message}</p>}
      <WorkWorkspace workspaceId={workspaceId} itemId={itemId} workId={selectedWorkId} />
    </div>
  )
}
