import BenchResearchPanel from './BenchResearchPanel'
import BenchDiagnosisPanel from './BenchDiagnosisPanel'
import BenchKnowledgePanel from './BenchKnowledgePanel'
import BenchTimegrapher from './BenchTimegrapher'
import WorkTimingWorkflow from './WorkTimingWorkflow'
import WorkPartsMatcher from './WorkPartsMatcher'
import './bench-workspace-area.css'

type WorkspaceArea = 'research' | 'diagnosis' | 'timing' | 'parts'

export default function BenchWorkspaceArea({
  area,
  workspaceId,
  itemId,
  workId,
  refreshKey,
  timingCheckpoint,
  onChanged,
  onBack,
}: {
  area: WorkspaceArea
  workspaceId: string
  itemId: string
  workId: string
  refreshKey: number
  timingCheckpoint: string
  onChanged: () => void | Promise<void>
  onBack: () => void
}) {
  const titles: Record<WorkspaceArea, { eyebrow: string; title: string; detail: string }> = {
    research: { eyebrow: 'RESEARCH', title: 'Research workspace', detail: 'Technical references, identification, parts and market evidence.' },
    diagnosis: { eyebrow: 'DIAGNOSIS', title: 'Diagnosis workspace', detail: 'Observed findings, deterministic evidence and Calibre Reasoning.' },
    timing: { eyebrow: 'TIMING', title: 'Timing workspace', detail: 'Live Timegrapher plus recorded timing history.' },
    parts: { eyebrow: 'PARTS', title: 'Parts & compatibility', detail: 'Stock, donors and fit evidence for this Work.' },
  }
  const heading = titles[area]

  return <section className="bench-workspace-area">
    <div className="bench-workspace-toolbar">
      <div><p className="eyebrow">{heading.eyebrow}</p><h2>{heading.title}</h2><p className="muted">{heading.detail}</p></div>
      <button type="button" className="secondary" onClick={onBack}>← Back to Work</button>
    </div>

    {area === 'research' && <BenchResearchPanel workspaceId={workspaceId} itemId={itemId} workId={workId} onChanged={onChanged} />}
    {area === 'diagnosis' && <div className="bench-tool-stack"><BenchDiagnosisPanel workspaceId={workspaceId} itemId={itemId} workId={workId} refreshKey={refreshKey} onChanged={onChanged} /><BenchKnowledgePanel workspaceId={workspaceId} itemId={itemId} workId={workId} refreshKey={refreshKey} /></div>}
    {area === 'timing' && <div className="bench-tool-stack"><BenchTimegrapher workspaceId={workspaceId} itemId={itemId} workId={workId} defaultCheckpoint={timingCheckpoint} onSaved={onChanged} /><WorkTimingWorkflow workspaceId={workspaceId} itemId={itemId} workId={workId} /></div>}
    {area === 'parts' && <div className="bench-tool-stack"><WorkPartsMatcher workspaceId={workspaceId} itemId={itemId} workId={workId} /></div>}
  </section>
}
