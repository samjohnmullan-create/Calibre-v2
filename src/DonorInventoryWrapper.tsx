import DonorInventoryBase from './DonorInventoryBase'
import DonorComponentIntelligence from './DonorComponentIntelligence'
import './donor-intelligence.css'

export default function DonorInventoryWrapper({ workspaceId }: { workspaceId: string }) {
  return (
    <>
      <DonorComponentIntelligence workspaceId={workspaceId} />
      <DonorInventoryBase workspaceId={workspaceId} />
    </>
  )
}
