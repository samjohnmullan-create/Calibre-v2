import { useEffect, useMemo, useState } from 'react'
import { supabase, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './lib/supabase'

type LibraryDocument = { id:string; title:string; document_type:string; document_scope:string; publisher:string; author:string; publication_year:number|null; url:string; reference_text:string; notes:string; verification_status:string; storage_bucket:string; storage_path:string; mime_type:string; file_size_bytes:number|null; page_count:number|null; searchable_text_status:string; tags:unknown; created_at:string }
function formatBytes(bytes:number|null){ if(!bytes)return ''; if(bytes<1024*1024)return `${Math.round(bytes/1024)} KB`; return `${(bytes/1024/1024).toFixed(1)} MB` }
function tagsOf(value:unknown){ return Array.isArray(value)?value.filter((entry):entry is string=>typeof entry==='string'):[] }
function pdfCandidate(document:LibraryDocument){ return document.mime_type==='application/pdf'||/\.pdf(?:$|[?#])/i.test(document.url)||Boolean(document.storage_path&&(!document.mime_type||document.mime_type==='application/pdf')) }

export default function DocumentLibrary({ workspaceId: suppliedWorkspaceId }: { workspaceId?: string }) {
  const [workspaceId,setWorkspaceId]=useState(suppliedWorkspaceId||'')
  const [documents,setDocuments]=useState<LibraryDocument[]>([])
  const [query,setQuery]=useState('')
  const [typeFilter,setTypeFilter]=useState('all')
  const [busyId,setBusyId]=useState<string|null>(null)
  const [extractingId,setExtractingId]=useState<string|null>(null)
  const [message,setMessage]=useState('')

  useEffect(()=>{ if(suppliedWorkspaceId){setWorkspaceId(suppliedWorkspaceId);return} void (async()=>{ const result=await supabase.from('workspaces').select('id').order('created_at',{ascending:true}).limit(1).maybeSingle(); if(result.error)return setMessage(`Library workspace could not load: ${result.error.message}`); setWorkspaceId(result.data?.id||'') })() },[suppliedWorkspaceId])

  async function load(){ if(!workspaceId)return; setMessage(''); const result=await supabase.from('knowledge_technical_documents').select('id,title,document_type,document_scope,publisher,author,publication_year,url,reference_text,notes,verification_status,storage_bucket,storage_path,mime_type,file_size_bytes,page_count,searchable_text_status,tags,created_at').eq('workspace_id',workspaceId).is('archived_at',null).order('created_at',{ascending:false}).limit(250); if(result.error)return setMessage(`Library could not load: ${result.error.message}`); setDocuments((result.data??[]) as LibraryDocument[]) }
  useEffect(()=>{void load()},[workspaceId])

  const types=useMemo(()=>[...new Set(documents.map(d=>d.document_type).filter(Boolean))].sort(),[documents])
  const visible=useMemo(()=>{ const needle=query.trim().toLowerCase(); return documents.filter(d=>{ if(typeFilter!=='all'&&d.document_type!==typeFilter)return false; if(!needle)return true; return [d.title,d.publisher,d.author,d.document_type,d.document_scope,d.reference_text,d.notes,...tagsOf(d.tags)].some(value=>value?.toLowerCase().includes(needle)) }) },[documents,query,typeFilter])

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
      setMessage(`✓ ${document.title}: ${payload?.finding_count??0} page-level evidence finding${payload?.finding_count===1?'':'s'} extracted and linked.`)
      await load()
    }catch(error){setMessage(`PDF could not be read: ${error instanceof Error?error.message:'Unknown error.'}`)}finally{setExtractingId(null)}
  }

  return <section className="library-documents">
    <div className="library-v2-intro-card"><p className="eyebrow">CALIBRE LIBRARY</p><h2>Documents & references</h2><p className="muted">One permanent home for manuals, technical sheets, catalogues, books and research references. A document can be linked to many Items, Work records and movements without being duplicated.</p></div>
    <div className="library-document-toolbar"><label><span>Search library</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Movement, maker, title, author, tag…" /></label><label><span>Document type</span><select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}><option value="all">All types</option>{types.map(type=><option key={type} value={type}>{type}</option>)}</select></label><div className="library-document-count"><strong>{visible.length}</strong><span>references</span></div></div>
    {!workspaceId?<div className="library-document-empty"><strong>Loading library…</strong></div>:visible.length===0?<div className="library-document-empty"><strong>No matching references yet.</strong><p className="muted">Documents saved from research or attached at the bench will appear here.</p></div>:<div className="library-document-grid">{visible.map(document=>{ const location=document.storage_path?`Calibre copy${document.file_size_bytes?` · ${formatBytes(document.file_size_bytes)}`:''}`:document.url?'External reference':'Metadata only'; const tags=tagsOf(document.tags); const extracted=document.searchable_text_status==='extracted'; return <article className="library-document-card" key={document.id}><div><p className="eyebrow">{document.document_type||document.document_scope||'REFERENCE'}</p><h3>{document.title}</h3></div><p className="muted">{[document.author,document.publisher,document.publication_year].filter(Boolean).join(' · ')||'Source details not recorded yet'}</p><div className="library-document-meta"><span>{location}</span><span>{document.verification_status||'candidate'}</span>{document.page_count?<span>{document.page_count} pages</span>:null}{extracted?<span>Evidence extracted</span>:null}</div>{document.reference_text&&<p>{document.reference_text}</p>}{tags.length>0&&<div className="library-document-tags">{tags.map(tag=><span key={tag}>{tag}</span>)}</div>}<div className="bench-guided-actions"><button type="button" className="secondary" disabled={busyId===document.id} onClick={()=>void openDocument(document)}>{busyId===document.id?'Opening…':'Open reference'}</button>{pdfCandidate(document)&&<button type="button" disabled={Boolean(extractingId)} onClick={()=>void extractEvidence(document)}>{extractingId===document.id?'Reading PDF…':extracted?'Re-read PDF':'Read & extract evidence'}</button>}</div></article>})}</div>}
    {message&&<p className="bench-guided-message" role="status" aria-live="polite">{message}</p>}
  </section>
}
