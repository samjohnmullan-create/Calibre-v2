import BenchDiagnosisCore from './BenchDiagnosisCore'
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
    <CalibreReasoningPanel {...props} />
  </>
}
