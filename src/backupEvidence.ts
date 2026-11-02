import { supabase } from './lib/supabase'

export type BackupExportKind = 'structured' | 'storage'

export type BackupExportEvidence = {
  export_kind: BackupExportKind
  export_version: string
  generated_at: string
  structured_table_count: number | null
  row_count: number | null
  file_count: number | null
  source_bytes: number | null
  artifact_bytes: number | null
  content_checksum: string | null
}

type RecordBackupExportInput = {
  workspaceId: string
  exportKind: BackupExportKind
  exportVersion: string
  structuredTableCount?: number | null
  rowCount?: number | null
  fileCount?: number | null
  sourceBytes?: number | null
  artifactBytes?: number | null
  contentChecksum?: string | null
  details?: Record<string, unknown>
}

export async function recordBackupExportEvidence(input: RecordBackupExportInput) {
  const result = await supabase
    .from('backup_export_events')
    .insert({
      workspace_id: input.workspaceId,
      export_kind: input.exportKind,
      export_version: input.exportVersion,
      structured_table_count: input.structuredTableCount ?? null,
      row_count: input.rowCount ?? null,
      file_count: input.fileCount ?? null,
      source_bytes: input.sourceBytes ?? null,
      artifact_bytes: input.artifactBytes ?? null,
      content_checksum: input.contentChecksum ?? null,
      details: input.details ?? {},
    })
    .select('generated_at')
    .single()

  if (result.error || !result.data?.generated_at) {
    throw new Error(result.error?.message ?? 'Backup export evidence was not recorded.')
  }
  return String(result.data.generated_at)
}

export async function loadLatestBackupExportEvidence(workspaceId: string) {
  const result = await supabase
    .from('backup_export_events')
    .select('export_kind,export_version,generated_at,structured_table_count,row_count,file_count,source_bytes,artifact_bytes,content_checksum')
    .eq('workspace_id', workspaceId)
    .order('generated_at', { ascending: false })
    .limit(20)

  if (result.error) throw new Error(result.error.message)
  const rows = (result.data ?? []) as BackupExportEvidence[]
  return {
    structured: rows.find((row) => row.export_kind === 'structured') ?? null,
    storage: rows.find((row) => row.export_kind === 'storage') ?? null,
  }
}
