import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { useWorkshopSession } from './WorkshopSessionGate'

export default function CustomerEnquiryAttention() {
  const { workspace } = useWorkshopSession()
  const [count, setCount] = useState(0)

  useEffect(() => {
    let active = true

    async function load() {
      const result = await supabase
        .from('customer_enquiries')
        .select('id,customer_publications!inner(workspace_id)', { count: 'exact', head: true })
        .eq('status', 'new')
        .eq('customer_publications.workspace_id', workspace.id)

      if (active && !result.error) setCount(result.count ?? 0)
    }

    void load()

    const channel = supabase
      .channel(`customer-enquiry-attention-${workspace.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_enquiries' }, () => void load())
      .subscribe()

    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)

    return () => {
      active = false
      window.removeEventListener('focus', onFocus)
      void supabase.removeChannel(channel)
    }
  }, [workspace.id])

  if (count < 1) return null

  return (
    <button
      type="button"
      className="customer-enquiry-attention"
      onClick={() => { window.location.hash = '#/customer/enquiries' }}
      aria-label={`${count} new customer ${count === 1 ? 'enquiry' : 'enquiries'}`}
    >
      <span className="customer-enquiry-attention-dot" aria-hidden="true" />
      <strong>{count}</strong>
      <span>{count === 1 ? 'new enquiry' : 'new enquiries'}</span>
      <span aria-hidden="true">→</span>
    </button>
  )
}
