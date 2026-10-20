import type { jsPDF as JsPdfDocument } from 'jspdf'
import encodeQR from 'qr'

export type DocumentConfig = {
  passport: {
    identity: boolean
    movement: boolean
    summary: boolean
    provenance: boolean
    condition: boolean
    service: boolean
    timing: boolean
    evidence: boolean
    gallery: boolean
    qr: boolean
  }
  certificate: {
    identity: boolean
    movement: boolean
    case: boolean
    condition: boolean
    service: boolean
    timing: boolean
    evidence: boolean
    hero_image: boolean
    qr: boolean
  }
}

export const DEFAULT_DOCUMENT_CONFIG: DocumentConfig = {
  passport: {
    identity: true,
    movement: true,
    summary: true,
    provenance: true,
    condition: true,
    service: true,
    timing: true,
    evidence: true,
    gallery: true,
    qr: true,
  },
  certificate: {
    identity: true,
    movement: true,
    case: true,
    condition: false,
    service: false,
    timing: true,
    evidence: true,
    hero_image: false,
    qr: true,
  },
}

export type CustomerDocumentRecord = {
  slug: string
  public_title: string
  subtitle: string
  summary: string
  condition_summary: string
  maker: string
  model: string
  reference: string
  era: string
  country: string
  movement_maker: string
  calibre: string
  jewels: number | null
  beat_rate: number | null
  movement_type: string
  escapement: string
  case_material: string
  crystal_type: string
  width_mm: number | null
  thickness_mm: number | null
  provenance_summary: string
  service_summary: string
  final_timing_summary: string
  authenticity_note: string
  certificate_number: string | null
  certificate_issued_at: string | null
  hero_image_url: string
  gallery_urls: string[]
  document_config?: DocumentConfig | null
}

export function normaliseDocumentConfig(config?: DocumentConfig | null): DocumentConfig {
  return {
    passport: { ...DEFAULT_DOCUMENT_CONFIG.passport, ...(config?.passport ?? {}) },
    certificate: { ...DEFAULT_DOCUMENT_CONFIG.certificate, ...(config?.certificate ?? {}) },
  }
}

export function passportUrl(slug: string) {
  return `https://calibreco.com.au/#/passport/${encodeURIComponent(slug)}`
}

function safe(value: unknown) {
  return value === null || value === undefined || value === '' ? '—' : String(value)
}

function date(value: string | null) {
  if (!value) return new Date().toLocaleDateString('en-AU')
  return new Date(value).toLocaleDateString('en-AU')
}

function qrDataUrl(url: string) {
  return encodeQR(url, 'data-url', { ecc: 'high', border: 4, scale: 8 })
}

async function imageDataUrl(url: string): Promise<string | null> {
  if (!url) return null
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const blob = await response.blob()
    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

function addHeading(doc: JsPdfDocument, title: string, y: number) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text(title.toUpperCase(), 18, y)
  doc.setDrawColor(175)
  doc.line(18, y + 2.5, 192, y + 2.5)
  return y + 9
}

function addWrapped(doc: JsPdfDocument, text: string, y: number, opts: { bold?: boolean; size?: number; indent?: number } = {}) {
  const x = 18 + (opts.indent ?? 0)
  const max = 174 - (opts.indent ?? 0)
  doc.setFont('helvetica', opts.bold ? 'bold' : 'normal')
  doc.setFontSize(opts.size ?? 9.5)
  const lines = doc.splitTextToSize(text || '—', max) as string[]
  for (const line of lines) {
    if (y > 278) {
      doc.addPage()
      y = 20
    }
    doc.text(line, x, y)
    y += 5
  }
  return y + 2
}

function addPairs(doc: JsPdfDocument, pairs: Array<[string, unknown]>, y: number) {
  doc.setFontSize(9)
  for (const [label, value] of pairs.filter(([, value]) => value !== '' && value !== null && value !== undefined)) {
    if (y > 278) {
      doc.addPage()
      y = 20
    }
    doc.setFont('helvetica', 'bold')
    doc.text(label, 18, y)
    doc.setFont('helvetica', 'normal')
    doc.text(safe(value), 68, y)
    y += 5.5
  }
  return y + 2
}

function addBrandHeader(doc: JsPdfDocument, label: string, record: CustomerDocumentRecord) {
  doc.setTextColor(24, 24, 24)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('CALIBRE & CO.', 18, 18)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text('TASMANIA · EVIDENCE BEFORE CERTAINTY', 18, 23)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(25)
  doc.text(label, 18, 38)
  doc.setFontSize(16)
  doc.text(record.public_title || [record.maker, record.model].filter(Boolean).join(' ') || 'Vintage Watch', 18, 50)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const line = [record.maker, record.model, record.reference].filter(Boolean).join(' · ')
  if (line) doc.text(line, 18, 56)
  return 66
}

export async function generatePassportPdf(record: CustomerDocumentRecord): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const config = normaliseDocumentConfig(record.document_config).passport
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  let y = addBrandHeader(doc, 'WATCH PASSPORT', record)

  doc.setFontSize(8.5)
  doc.text(`Passport ID: ${record.certificate_number || 'Pending'}`, 18, y)
  doc.text(`Record date: ${date(record.certificate_issued_at)}`, 118, y)
  y += 10

  if (config.summary && record.summary) {
    y = addHeading(doc, 'The watch', y)
    y = addWrapped(doc, record.summary, y)
  }
  if (config.identity) {
    y = addHeading(doc, 'Identity', y)
    y = addPairs(doc, [
      ['Maker', record.maker], ['Model', record.model], ['Reference', record.reference], ['Approx. era', record.era], ['Country', record.country],
      ['Case material', record.case_material], ['Crystal', record.crystal_type], ['Width', record.width_mm == null ? '' : `${record.width_mm} mm`],
      ['Thickness', record.thickness_mm == null ? '' : `${record.thickness_mm} mm`],
    ], y)
  }
  if (config.movement) {
    y = addHeading(doc, 'Movement', y)
    y = addPairs(doc, [
      ['Movement maker', record.movement_maker], ['Calibre', record.calibre], ['Type', record.movement_type], ['Jewels', record.jewels],
      ['Beat rate', record.beat_rate == null ? '' : `${record.beat_rate.toLocaleString()} BPH`], ['Escapement', record.escapement],
    ], y)
  }
  if (config.provenance && record.provenance_summary) {
    y = addHeading(doc, 'Provenance', y)
    y = addWrapped(doc, record.provenance_summary, y)
  }
  if (config.condition && record.condition_summary) {
    y = addHeading(doc, 'Condition', y)
    y = addWrapped(doc, record.condition_summary, y)
  }
  if (config.service && record.service_summary) {
    y = addHeading(doc, 'Workshop record', y)
    y = addWrapped(doc, record.service_summary, y)
  }
  if (config.timing && record.final_timing_summary) {
    y = addHeading(doc, 'Final timing', y)
    y = addWrapped(doc, record.final_timing_summary, y)
  }
  if (config.evidence && record.authenticity_note) {
    y = addHeading(doc, 'Evidence note', y)
    y = addWrapped(doc, record.authenticity_note, y)
  }

  if (config.gallery) {
    const urls = [record.hero_image_url, ...(record.gallery_urls ?? [])].filter(Boolean).slice(0, 6)
    if (urls.length) {
      y = addHeading(doc, 'Photographic record', y)
      for (const url of urls) {
        const image = await imageDataUrl(url)
        if (!image) continue
        if (y > 225) { doc.addPage(); y = 20 }
        try {
          doc.addImage(image, 'JPEG', 18, y, 54, 40, undefined, 'FAST')
          y += 45
        } catch {
          // Keep the PDF usable even if a particular browser image codec cannot be embedded.
        }
      }
    }
  }

  if (config.qr) {
    if (y > 238) { doc.addPage(); y = 20 }
    y = addHeading(doc, 'Permanent digital record', y)
    const url = passportUrl(record.slug)
    doc.addImage(qrDataUrl(url), 'GIF', 18, y, 34, 34)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.text('Scan to retrieve the current Calibre Passport and issued documents.', 58, y + 10)
    const lines = doc.splitTextToSize(url, 130) as string[]
    doc.text(lines, 58, y + 17)
  }

  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page)
    doc.setFontSize(7.5)
    doc.setTextColor(100)
    doc.text(`Calibre & Co. · ${record.certificate_number || 'Documented watch'} · Page ${page} of ${pages}`, 18, 289)
  }
  return doc.output('blob')
}

export async function generateCertificatePdf(record: CustomerDocumentRecord): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const config = normaliseDocumentConfig(record.document_config).certificate
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  let y = addBrandHeader(doc, 'WATCH CERTIFICATE', record)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(`Certificate: ${record.certificate_number || 'Pending'}`, 18, y)
  doc.text(`Issued: ${date(record.certificate_issued_at)}`, 132, y)
  y += 12

  if (config.hero_image && record.hero_image_url) {
    const image = await imageDataUrl(record.hero_image_url)
    if (image) {
      try {
        doc.addImage(image, 'JPEG', 18, y, 60, 45, undefined, 'FAST')
        y += 51
      } catch { /* image remains optional */ }
    }
  }

  if (config.identity) {
    y = addHeading(doc, 'Identification', y)
    y = addPairs(doc, [['Maker', record.maker], ['Model', record.model], ['Reference', record.reference], ['Approx. era', record.era], ['Country', record.country]], y)
  }
  if (config.movement) {
    y = addHeading(doc, 'Movement', y)
    y = addPairs(doc, [['Movement maker', record.movement_maker], ['Calibre', record.calibre], ['Movement', record.movement_type], ['Jewels', record.jewels], ['Beat rate', record.beat_rate == null ? '' : `${record.beat_rate.toLocaleString()} BPH`]], y)
  }
  if (config.case) {
    y = addHeading(doc, 'Case', y)
    y = addPairs(doc, [['Material', record.case_material], ['Crystal', record.crystal_type], ['Width', record.width_mm == null ? '' : `${record.width_mm} mm`], ['Thickness', record.thickness_mm == null ? '' : `${record.thickness_mm} mm`]], y)
  }
  if (config.condition && record.condition_summary) {
    y = addHeading(doc, 'Condition', y)
    y = addWrapped(doc, record.condition_summary, y)
  }
  if (config.service && record.service_summary) {
    y = addHeading(doc, 'Workshop record', y)
    y = addWrapped(doc, record.service_summary, y)
  }
  if (config.timing && record.final_timing_summary) {
    y = addHeading(doc, 'Final timing', y)
    y = addWrapped(doc, record.final_timing_summary, y)
  }
  if (config.evidence && record.authenticity_note) {
    y = addHeading(doc, 'Evidence note', y)
    y = addWrapped(doc, record.authenticity_note, y)
  }

  if (config.qr) {
    if (y > 236) { doc.addPage(); y = 20 }
    y = addHeading(doc, 'Digital verification', y)
    const url = passportUrl(record.slug)
    doc.addImage(qrDataUrl(url), 'GIF', 18, y, 32, 32)
    doc.setFontSize(8.5)
    doc.text('Scan to retrieve this watch’s permanent Calibre record.', 56, y + 10)
    doc.text(doc.splitTextToSize(url, 130) as string[], 56, y + 17)
    y += 38
  }

  if (y > 252) { doc.addPage(); y = 25 }
  doc.setDrawColor(170)
  doc.line(18, y, 192, y)
  y += 7
  doc.setFontSize(7.8)
  doc.setTextColor(80)
  const note = 'This certificate records the customer-safe facts documented by Calibre & Co. at the date of issue. Vintage watches may contain later replacement components or alterations unless specifically stated. Where evidence is incomplete, the record preserves that uncertainty.'
  doc.text(doc.splitTextToSize(note, 174) as string[], 18, y)
  doc.setFont('helvetica', 'bold')
  doc.text('CALIBRE & CO. · TASMANIA · EVIDENCE BEFORE CERTAINTY', 18, 288)
  return doc.output('blob')
}
