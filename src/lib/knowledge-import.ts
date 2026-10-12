import { supabase } from './supabase'

type KnowledgeEngine = Record<string, unknown>
type Progress = { dataset: string; processed: number; total: number; overallProcessed: number; overallTotal: number }

type ImportOptions = {
  file: File
  onProgress?: (progress: Progress) => void
}

const preferredOrder = [
  'sources',
  'families',
  'calibres',
  'part_references',
  'calibre_part_refs',
  'compatibility_edges',
  'movement_specs',
  'technical_documents',
  'identification_signals',
  'knowledge_rules',
]

function stringHash(input: string) {
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function chunkRecords(records: unknown[], targetBytes = 240_000) {
  const chunks: unknown[][] = []
  let current: unknown[] = []
  let currentBytes = 2

  for (const record of records) {
    const bytes = new Blob([JSON.stringify(record)]).size + 1
    if (current.length > 0 && currentBytes + bytes > targetBytes) {
      chunks.push(current)
      current = []
      currentBytes = 2
    }
    current.push(record)
    currentBytes += bytes
  }

  if (current.length > 0) chunks.push(current)
  return chunks
}

export async function importKnowledgeEngine({ file, onProgress }: ImportOptions) {
  const raw = await file.text()
  const engine = JSON.parse(raw) as KnowledgeEngine
  const metadata = (engine.metadata && typeof engine.metadata === 'object' ? engine.metadata : {}) as Record<string, unknown>
  const engineName = String(metadata.name ?? 'Calibre Knowledge Engine')
  const engineVersion = String(metadata.version ?? 'unknown')
  const batchKey = `engine-${engineVersion}-${stringHash(raw)}`

  const datasets = Object.entries(engine)
    .filter(([key, value]) => key !== 'metadata' && Array.isArray(value))
    .sort(([a], [b]) => {
      const ai = preferredOrder.indexOf(a)
      const bi = preferredOrder.indexOf(b)
      if (ai === -1 && bi === -1) return a.localeCompare(b)
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    }) as [string, unknown[]][]

  const overallTotal = datasets.reduce((sum, [, records]) => sum + records.length, 0)
  let overallProcessed = 0

  const { error: beginError } = await supabase.rpc('begin_knowledge_import', {
    p_batch_key: batchKey,
    p_engine_name: engineName,
    p_engine_version: engineVersion,
    p_source_filename: file.name,
    p_source_hash: stringHash(raw),
    p_metadata: metadata,
  })
  if (beginError) throw beginError

  for (const [dataset, records] of datasets) {
    let datasetProcessed = 0
    for (const chunk of chunkRecords(records)) {
      const { error } = await supabase.rpc('import_knowledge_chunk', {
        p_batch_key: batchKey,
        p_dataset_name: dataset,
        p_records: chunk,
      })
      if (error) throw new Error(`${dataset}: ${error.message}`)
      datasetProcessed += chunk.length
      overallProcessed += chunk.length
      onProgress?.({ dataset, processed: datasetProcessed, total: records.length, overallProcessed, overallTotal })
    }
  }

  const { data: summary, error: finalizeError } = await supabase.rpc('finalize_knowledge_import', { p_batch_key: batchKey })
  if (finalizeError) throw finalizeError

  return { batchKey, summary, engineName, engineVersion, overallTotal }
}
