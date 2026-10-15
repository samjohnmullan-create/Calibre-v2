import BenchDiagnosisCore from './BenchDiagnosisCore'
import DiagnosticGraphPanel from './DiagnosticGraphPanel'
import CalibreReasoningPanel from './CalibreReasoningPanel'

type Props = {
  workspaceId: string
  itemId: string
  workId: string
  refreshKey?: number
  onChanged?: () => void | Promise<void>
}

export default function BenchDiagnosisPanel(props: Props) {
  return <>
    <BenchDiagnosisCore {...props} />
    <DiagnosticGraphPanel workspaceId={props.workspaceId} workId={props.workId} refreshKey={props.refreshKey} />
    <CalibreReasoningPanel {...props} />
  </>
}
