import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import {
  DEFAULT_DOCUMENT_CONFIG,
  DocumentConfig,
  CustomerDocumentRecord,
  generateCertificatePdf,
  generatePassportPdf,
  normaliseDocumentConfig,
  passportUrl,
} from './customerDocuments'
import CalibreBrandMark from './CalibreBrandMark'
import './customer-pack.css'

type Item = { id: string; item_number: number; title: string; status: string }
type Publication = CustomerDocumentRecord & {
  id: string
  workspace_id: string
  item_id: string
  published: boolean
  document_config: DocumentConfig | null
  passport_pdf_url: string | null
  certificate_pdf_url: string | null
  customer_pack_issued_at: string | null
}

const passportLabels: Array<[keyof DocumentConfig['passport'], string, string]> = [
  ['identity', 'Identity & case', 'Maker, model, reference, era, case and dimensions'],
  ['movement', 'Movement', 'Calibre, jewels, beat rate, escapement and movement maker'],
  ['summary', 'Watch story', 'Customer-facing description and research summary'],
  ['provenance', 'Provenance', 'Known ownership or historical record'],
  ['condition', 'Condition', 'Customer-safe condition description'],
  ['service', 'Workshop record', 'The service/work you choose to disclose'],
  ['timing', 'Final timing', 'Final measured performance summary'],
  ['evidence', 'Evidence note', 'Confirmed, probable and unresolved facts'],
  ['gallery', 'Photographs', 'Published cover and gallery images'],
  ['qr', 'QR retrieval', 'Permanent link back to the online Passport'],
]

const certificateLabels: Array<[keyof DocumentConfig['certificate'], string, string]> = [
  ['identity', 'Identity', 'Maker, model, reference, era and country'],
  ['movement', 'Movement', 'Movement maker, calibre, jewels and beat rate'],
  ['case', 'Case & dimensions', 'Case material, crystal and measurements'],
  ['condition', 'Condition', 'Customer-safe condition summary'],
  ['service', 'Workshop record', 'Service summary on the formal certificate'],
  ['timing', 'Final timing', 'Final timing result'],
  ['evidence', 'Evidence note', 'Identification/authenticity qualification'],
  ['hero_image', 'Watch photograph', 'Include the published cover photograph'],
  ['qr', 'QR verification', 'Permanent link back to the online Passport'],
]

function currentRoute() {
  return window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)[0] || ''
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function CustomerPackHost() {
  const [route, setRoute] = useState(currentRoute)
  const [workspaceId, setWorkspaceId] = useState('')
  const [items, setItems] = useState<Item[]>([])
  const [itemId, setItemId] = useState('')
  const [record, setRecord] = useState<Publication | null>(null)
  const [config, setConfig] = useState<DocumentConfig>(DEFAULT_DOCUMENT_CONFIG)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const sync = () => setRoute(currentRoute())
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  useEffect(() => {
    if (route !== 'customer-pack') return
    let active = true
    ;(async () => {
      const workspace = await supabase.from('workspaces').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (!active || workspace.error || !workspace.data) {
        if (workspace.error) setMessage(workspace.error.message)
        return
      }
      setWorkspaceId(workspace.data.id)
      const result = await supabase.from('items').select('id,item_number,title,status').eq('workspace_id', workspace.data.id).is('archived_at', null).order('item_number', { ascending: false })
      if (!active) return
      if (result.error) setMessage(result.error.message)
      else {
        const next = (result.data ?? []) as Item[]
        setItems(next)
        if (!itemId && next[0]) setItemId(next[0].id)
      }
    })()
    return () => { active = false }
  }, [route])

  useEffect(() => {
    if (route !== 'customer-pack' || !workspaceId || !itemId) return
    let active = true
    setMessage('Loading customer record…')
    ;(async () => {
      const result = await supabase.from('customer_publications').select('*').eq('workspace_id', workspaceId).eq('item_id', itemId).maybeSingle()
      if (!active) return
      if (result.error) {
        setRecord(null)
        setMessage(result.error.message)
        return
      }
      const next = result.data as Publication | null
      setRecord(next)
      setConfig(normaliseDocumentConfig(next?.document_config))
      setMessage(next ? '' : 'This watch does not have a customer record yet. Prepare it in Publishing Studio first.')
    })()
    return () => { active = false }
  }, [route, workspaceId, itemId])

  const selectedItem = useMemo(() => items.find((item) => item.id === itemId) ?? null, [items, itemId])

  function setPassport(key: keyof DocumentConfig['passport'], checked: boolean) {
    setConfig((current) => ({ ...current, passport: { ...current.passport, [key]: checked } }))
  }
  function setCertificate(key: keyof DocumentConfig['certificate'], checked: boolean) {
    setConfig((current) => ({ ...current, certificate: { ...current.certificate, [key]: checked } }))
  }

  async function saveConfig() {
    if (!record) return false
    setBusy(true)
    setMessage('Saving document choices…')
    const result = await supabase.from('customer_publications').update({ document_config: config }).eq('id', record.id).select('*').single()
    setBusy(false)
    if (result.error || !result.data) {
      setMessage(result.error?.message || 'Could not save Customer Pack choices.')
      return false
    }
    setRecord(result.data as Publication)
    setMessage('Customer Pack choices saved.')
    return true
  }

  async function preview(kind: 'passport' | 'certificate') {
    if (!record) return
    setBusy(true)
    setMessage(`Building ${kind} preview…`)
    try {
      const source = { ...record, document_config: config }
      const blob = kind === 'passport' ? await generatePassportPdf(source) : await generateCertificatePdf(source)
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener,noreferrer')
      setTimeout(() => URL.revokeObjectURL(url), 60000)
      setMessage(`${kind === 'passport' ? 'Passport' : 'Certificate'} preview opened.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not build preview.')
    } finally {
      setBusy(false)
    }
  }

  async function issuePack() {
    if (!record) return
    if (!record.slug) { setMessage('Set the public Passport URL slug before issuing the pack.'); return }
    setBusy(true)
    setMessage('Generating Passport and Certificate PDFs…')
    try {
      const issuedAt = new Date().toISOString()
      const source: Publication = { ...record, document_config: config, certificate_issued_at: record.certificate_issued_at || issuedAt }
      const [passportBlob, certificateBlob] = await Promise.all([
        generatePassportPdf(source),
        generateCertificatePdf(source),
      ])
      const stamp = issuedAt.replace(/[:.]/g, '-')
      const base = `${workspaceId}/${itemId}/documents/${stamp}`
      const [passportUpload, certificateUpload] = await Promise.all([
        supabase.storage.from('calibre-public').upload(`${base}-passport.pdf`, passportBlob, { contentType: 'application/pdf', cacheControl: '31536000', upsert: false }),
        supabase.storage.from('calibre-public').upload(`${base}-certificate.pdf`, certificateBlob, { contentType: 'application/pdf', cacheControl: '31536000', upsert: false }),
      ])
      if (passportUpload.error) throw passportUpload.error
      if (certificateUpload.error) throw certificateUpload.error
      const passportPdfUrl = supabase.storage.from('calibre-public').getPublicUrl(passportUpload.data.path).data.publicUrl
      const certificatePdfUrl = supabase.storage.from('calibre-public').getPublicUrl(certificateUpload.data.path).data.publicUrl
      const update = await supabase.from('customer_publications').update({
        document_config: config,
        passport_pdf_url: passportPdfUrl,
        certificate_pdf_url: certificatePdfUrl,
        customer_pack_issued_at: issuedAt,
        certificate_issued_at: source.certificate_issued_at,
      }).eq('id', record.id).select('*').single()
      if (update.error || !update.data) throw update.error || new Error('PDFs uploaded but the customer record could not be updated.')
      setRecord(update.data as Publication)
      setMessage('Customer Pack issued. Both PDFs are stored against the watch and the QR points to its permanent Passport.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Customer Pack issue failed.')
    } finally {
      setBusy(false)
    }
  }

  if (route === 'customer') {
    return <button type="button" className="customer-pack-launch" onClick={() => { window.location.hash = '#/customer-pack' }}>Customer Pack</button>
  }
  if (route !== 'customer-pack') return null

  return (
    <main className="customer-pack-page">
      <header className="customer-pack-header">
        <div className="customer-pack-brand"><CalibreBrandMark /><div><p className="eyebrow">CALIBRE & CO.</p><h1>Customer Pack</h1><p>Choose exactly what this customer receives, preview it, then issue permanent PDF snapshots.</p></div></div>
        <button type="button" className="secondary" onClick={() => { window.location.hash = '#/customer' }}>← Publishing Studio</button>
      </header>

      <section className="section-card customer-pack-picker">
        <label>Watch<select value={itemId} onChange={(e) => setItemId(e.target.value)}>{items.map((item) => <option key={item.id} value={item.id}>#{item.item_number} · {item.title}</option>)}</select></label>
        <div><span>Workshop status</span><strong>{selectedItem?.status?.replaceAll('_', ' ') || '—'}</strong></div>
      </section>

      {!record && <section className="section-card customer-pack-empty"><h2>No customer record yet</h2><p>{message}</p><button type="button" onClick={() => { window.location.hash = '#/customer' }}>Prepare customer record</button></section>}

      {record && <>
        <section className="customer-pack-status section-card">
          <div><span>Passport ID</span><strong>{record.certificate_number || 'Pending'}</strong></div>
          <div><span>Permanent QR destination</span><a href={passportUrl(record.slug)} target="_blank" rel="noreferrer">{passportUrl(record.slug)}</a></div>
          <div><span>Last issued</span><strong>{record.customer_pack_issued_at ? new Date(record.customer_pack_issued_at).toLocaleString('en-AU') : 'Not issued yet'}</strong></div>
        </section>

        <div className="customer-pack-columns">
          <section className="section-card customer-pack-options">
            <div className="customer-pack-title"><div><p className="eyebrow">DOCUMENT 01</p><h2>Watch Passport</h2></div><button type="button" className="secondary small" onClick={() => setConfig((c) => ({ ...c, passport: { ...DEFAULT_DOCUMENT_CONFIG.passport } }))}>Reset</button></div>
            <p className="customer-pack-copy">The detailed living record. Untick anything you do not want included in this watch’s issued Passport.</p>
            {passportLabels.map(([key, label, help]) => <label className="customer-pack-toggle" key={key}><input type="checkbox" checked={config.passport[key]} onChange={(e) => setPassport(key, e.target.checked)} /><span><strong>{label}</strong><small>{help}</small></span></label>)}
            <button type="button" className="secondary" disabled={busy} onClick={() => void preview('passport')}>Preview Passport PDF</button>
          </section>

          <section className="section-card customer-pack-options">
            <div className="customer-pack-title"><div><p className="eyebrow">DOCUMENT 02</p><h2>Watch Certificate</h2></div><button type="button" className="secondary small" onClick={() => setConfig((c) => ({ ...c, certificate: { ...DEFAULT_DOCUMENT_CONFIG.certificate } }))}>Reset</button></div>
            <p className="customer-pack-copy">The formal dated snapshot. Keep it concise, or include extra workshop information for a particular watch.</p>
            {certificateLabels.map(([key, label, help]) => <label className="customer-pack-toggle" key={key}><input type="checkbox" checked={config.certificate[key]} onChange={(e) => setCertificate(key, e.target.checked)} /><span><strong>{label}</strong><small>{help}</small></span></label>)}
            <button type="button" className="secondary" disabled={busy} onClick={() => void preview('certificate')}>Preview Certificate PDF</button>
          </section>
        </div>

        <section className="section-card customer-pack-issue">
          <div><p className="eyebrow">ISSUE CUSTOMER PACK</p><h2>Freeze the documents</h2><p>Issuing creates new PDF files and stores them with the watch. The QR always returns to the permanent online Passport, so future versions can be issued without changing the code.</p></div>
          <div className="customer-pack-actions"><button type="button" className="secondary" disabled={busy} onClick={() => void saveConfig()}>Save choices</button><button type="button" disabled={busy} onClick={() => void issuePack()}>{busy ? 'Working…' : record.customer_pack_issued_at ? 'Issue new version' : 'Issue Passport + Certificate'}</button></div>
        </section>

        {(record.passport_pdf_url || record.certificate_pdf_url) && <section className="section-card customer-pack-files"><p className="eyebrow">CURRENT ISSUED FILES</p><div>{record.passport_pdf_url && <a href={record.passport_pdf_url} target="_blank" rel="noreferrer">Open Passport PDF ↗</a>}{record.certificate_pdf_url && <a href={record.certificate_pdf_url} target="_blank" rel="noreferrer">Open Certificate PDF ↗</a>}</div></section>}
        <p className="customer-pack-message">{message}</p>
      </>}
    </main>
  )
}
