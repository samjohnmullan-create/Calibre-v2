import { useEffect, useMemo, useState } from 'react'
import { supabase, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './lib/supabase'
import './library-evidence.css'

type LibraryDocument = { id:string; title:string; document_type:string; document_scope:string; publisher:string; author:string; publication_year:number|null; url:string; reference_text:string; notes:string; verification_status:string; storage_bucket:string; storage_path:string; mime_type:string; file_size_bytes:number|null; page_count:number|null; searchable_text_status:string; extraction_summary:string; extraction_model:string; extracted_at:string|null; tags:unknown; created_at:string }
type DocumentFinding = { id:string; document_id:string; topic:string; finding:string; page_from:number; page_to:number; confidence:string; evidence_note:string; review_status:'candidate'|'accepted'|'rejected'; extracted_at:string }
function formatBytes(bytes:number|null){ if(!bytes)return ''; if(bytes<1024*1024)return `${Math.round(bytes/1024)} KB`; return `${(bytes/1024/1024).toFixed(1)} MB` }
function tagsOf(value:unknown){ return Array.isArray(value)?value.filter((entry):entry is string=>typeof entry==='string'):[] }
function pdfCandidate(document:LibraryDocument){ return document.mime_type==='application/pdf'||/\.pdf(?:$|[?#])/i.test(document.url)||Boolean(document.storage_path&&(!document.mime_type||document.mime_type==='application/pdf')) }
function pageLabel(row:DocumentFinding){ return row.page_to&&row.page_to!==row.page_from?`pp. ${row.page_from}–${row.page_to}`:`p. ${row.page_from}` }
function titleCase(value:string){ return value.replaceAll('_',' ').replace(/\b\w/g,(letter)=>letter.toUpperCase()) }

export default function DocumentLibrary({ workspaceId: suppliedWorkspaceId }: { workspaceId?: string }) {
  const [workspaceId,setWorkspaceId]=useState(suppliedWorkspaceId||'')
  const [documents,setDocuments]=useState<LibraryDocument[]>([])
  const [findings,setFindings]=useState<DocumentFinding[]>([])
  const [query,setQuery]=useState('')
  const [typeFilter,setTypeFilter]=useState('all')
  const [busyId,setBusyId]=useState<string|null>(null)
  const [extractingId,setExtractingId]=useState<string|null>(null)
  const [reviewingId,setReviewingId]=useState<string|null>(null)
  const [message,setMessage]=useState('')

  useEffect(()=>{ if(suppliedWorkspaceId){setWorkspaceId(suppliedWorkspaceId);return} void (async()=>{ const result=await supabase.from('workspaces').select('id').order('created_at',{ascending:true}).limit(1).maybeSingle(); if(result.error)return setMessage(`Library workspace could not load: ${result.error.message}`); setWorkspaceId(result.data?.id||'') })() },[suppliedWorkspaceId])

  async function load(){
    if(!workspaceId)return
    setMessage('')
    const result=await supabase.from('knowledge_technical_documents').select('id,title,document_type,document_scope,publisher,author,publication_year,url,reference_text,notes,verification_status,storage_bucket,storage_path,mime_type,file_size_bytes,page_count,searchable_text_status,extraction_summary,extraction_model,extracted_at,tags,created_at').eq('workspace_id',workspaceId).is('archived_at',null).order('created_at',{ascending:false}).limit(250)
    if(result.error)return setMessage(`Library could not load: ${result.error.message}`)
    const nextDocuments=(result.data??[]) as LibraryDocument[]
    setDocuments(nextDocuments)
    const ids=nextDocuments.map((row)=>row.id)
    if(!ids.length){setFindings([]);return}
    const evidence=await supabase.from('knowledge_document_findings').select('id,document_id,topic,finding,page_from,page_to,confidence,evidence_note,review_status,extracted_at').eq('workspace_id',workspaceId).in('document_id',ids).order('page_from',{ascending:true})
    if(evidence.error)return setMessage(`Documents loaded, but extracted evidence could not load: ${evidence.error.message}`)
    setFindings((evidence.data??[]) as DocumentFinding[])
  }
  useEffect(()=>{void load()},[workspaceId])

  const findingsByDocument=useMemo(()=>{ const map=new Map<string,DocumentFinding[]>(); for(const row of findings){ const current=map.get(row.document_id)??[]; current.push(row); map.set(row.document_id,current) } return map },[findings])
  const types=useMemo(()=>[...new Set(documents.map(d=>d.document_type).filter(Boolean))].sort(),[documents])
  const visible=useMemo(()=>{ const needle=query.trim().toLowerCase(); return documents.filter(d=>{ if(typeFilter!=='all'&&d.document_type!==typeFilter)return false; if(!needle)return true; const evidence=(findingsByDocument.get(d.id)??[]).flatMap(row=>[row.topic,row.finding,row.evidence_note]); return [d.title,d.publisher,d.author,d.document_type,d.document_scope,d.reference_text,d.notes,d.extraction_summary,...tagsOf(d.tags),...evidence].some(value=>value?.toLowerCase().includes(needle)) }) },[documents,query,typeFilter,findingsByDocument])

  async function openDocument(document:LibraryDocument){ setBusyId(document.id); setMessage(''); if(document.storage_bucket&&document.storage_path){ const signed=await supabase.storage.from(document.storage_bucket).createSignedUrl(document.storage_path,600); setBusyId(null); if(signed.error||!signed.data?.signedUrl)return setMessage(`Document could not open: ${signed.error?.message??'No signed link returned.'}`); window.open(signed.data.signedUrl,'_blank','noopener,noreferrer'); return } setBusyId(null); if(document.url)window.open(document.url,'_blank','noopener,noreferrer'); else setMessage('This library record has no file or external link yet.') }

  async function extractEvidence(document:LibraryDocument){
    if(extractingId)return
    setExtractingId(document.id); setMessage(`Reading ${document.title} page by page…`)
    try{
      const session=await supabase.auth.getSession(); const accessToken=session.data.session?.access_token
      if(!accessToken)throw new Error('Your Calibre session has expired. Sign in again and retry.')
      const response=await fetch(`${SUPABASE_URL}/functions/v1/calibre-document-extract`,{method:'POST',headers:{Authorization:`Bearer ${accessToken}`,apikey:SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({document_id:document.id})})
      let payload:any=null; try{payload=await response.json()}catch{payload=null}
      if(!response.ok)throw new Error(payload?.error||`Document reader returned ${response.status}.`)
      setMessage(`✓ ${document.title}: ${payload?.finding_count??0} page-level evidence finding${payload?.finding_count===1?'':'s'} extracted and saved for review.`)
      await load()
    }catch(error){setMessage(`PDF could not be read: ${error instanceof Error?error.message:'Unknown error.'}`)}finally{setExtractingId(null)}
  }

  async function reviewFinding(id:string,status:'accepted'|'rejected'){
    setReviewingId(id); setMessage('')
    const result=await supabase.from('knowledge_document_findings').update({review_status:status}).eq('workspace_id',workspaceId).eq('id',id)
    setReviewingId(null)
    if(result.error)return setMessage(`Evidence review could not be saved: ${result.error.message}`)
    setFindings(current=>current.map(row=>row.id===id?{...row,review_status:status}:row))
  }

  return <section className="library-documents">
    <div className="library-document-heading"><h2>Documents & references</h2><p className="muted">Search manuals, books, technical sheets and saved research.</p></div>
    <div className="library-document-toolbar"><label><span>Search library</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Movement, maker, title, evidence, tag…" /></label><label><span>Document type</span><select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}><option value="all">All types</option>{types.map(type=><option key={type} value={type}>{type}</option>)}</select></label><div className="library-document-count"><strong>{visible.length}</strong><span>references</span></div></div>
    {!workspaceId?<div className="library-document-empty"><strong>Loading library…</strong></div>:visible.length===0?<div className="library-document-empty"><strong>No matching references yet.</strong><p className="muted">Documents saved from research or attached at the bench will appear here.</p></div>:<div className="library-document-grid">{visible.map(document=>{ const location=document.storage_path?`Calibre copy${document.file_size_bytes?` · ${formatBytes(document.file_size_bytes)}`:''}`:document.url?'External reference':'Metadata only'; const tags=tagsOf(document.tags); const extracted=document.searchable_text_status==='extracted'; const evidence=findingsByDocument.get(document.id)??[]; const accepted=evidence.filter(row=>row.review_status==='accepted').length; const candidates=evidence.filter(row=>row.review_status==='candidate').length; return <article className="library-document-card" key={document.id}><div><p className="eyebrow">{document.document_type||document.document_scope||'REFERENCE'}</p><h3>{document.title}</h3></div><p className="muted">{[document.author,document.publisher,document.publication_year].filter(Boolean).join(' · ')||'Source details not recorded yet'}</p><div className="library-document-meta"><span>{location}</span><span>{document.verification_status||'candidate'}</span>{document.page_count?<span>{document.page_count} pages</span>:null}{extracted?<span>{evidence.length} evidence</span>:null}{accepted?<span>{accepted} accepted</span>:null}</div>{document.reference_text&&<p>{document.reference_text}</p>}{document.extraction_summary&&<p className="muted"><strong>Calibre extraction:</strong> {document.extraction_summary}</p>}{tags.length>0&&<div className="library-document-tags">{tags.map(tag=><span key={tag}>{tag}</span>)}</div>}{evidence.length>0&&<details className="library-evidence"><summary><span>Page evidence</span><small>{candidates?`${candidates} awaiting review`:`${accepted} accepted`}</small></summary><div className="library-evidence-list">{evidence.map(row=><article className={`library-evidence-row status-${row.review_status}`} key={row.id}><div className="library-evidence-top"><strong>{row.topic}</strong><span>{pageLabel(row)} · {titleCase(row.confidence)}</span></div><p>{row.finding}</p>{row.evidence_note&&<small>{row.evidence_note}</small>}<div className="library-evidence-review"><span>{titleCase(row.review_status)}</span>{row.review_status==='candidate'&&<><button type="button" disabled={reviewingId===row.id} onClick={()=>void reviewFinding(row.id,'accepted')}>Accept evidence</button><button type="button" className="secondary" disabled={reviewingId===row.id} onClick={()=>void reviewFinding(row.id,'rejected')}>Reject</button></>}</div></article>)}</div></details>}<div className="bench-guided-actions"><button type="button" className="secondary" disabled={busyId===document.id} onClick={()=>void openDocument(document)}>{busyId===document.id?'Opening…':'Open reference'}</button>{pdfCandidate(document)&&<button type="button" disabled={Boolean(extractingId)} onClick={()=>void extractEvidence(document)}>{extractingId===document.id?'Reading PDF…':extracted?'Re-read PDF':'Read & extract evidence'}</button>}</div></article>})}</div>}
    {message&&<p className="bench-guided-message" role="status" aria-live="polite">{message}</p>}
  </section>
}
