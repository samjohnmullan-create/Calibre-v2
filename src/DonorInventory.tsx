import DonorInventoryBase from './DonorInventoryBase'
import DonorComponentIntelligence from './DonorComponentIntelligence'
import './donor-intelligence.css'

export default function DonorInventory({ workspaceId }: { workspaceId: string }) {
  return (
    <>
      <DonorComponentIntelligence workspaceId={workspaceId} />
      <DonorInventoryBase workspaceId={workspaceId} />
    </>
  )
}
