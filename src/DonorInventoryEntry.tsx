import DonorInventoryBase from './DonorInventoryBase'
import DonorComponentIntelligence from './DonorComponentIntelligence'
import './donor-intelligence.css'

export default function DonorInventoryEntry({ workspaceId }: { workspaceId: string }) {
  return (
    <>
      <DonorComponentIntelligence workspaceId={workspaceId} />
      <DonorInventoryBase workspaceId={workspaceId} />
    </>
  )
}
