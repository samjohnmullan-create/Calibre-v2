import { useEffect, useRef } from 'react'

type Props = { open: boolean; onClose: () => void }

export default function UniversalNewMenu({ open, onClose }: Props) {
  const sheetRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  function createItem() {
    onClose()
    window.dispatchEvent(new CustomEvent('calibre:new-item'))
  }

  function importInvoice() {
    onClose()
    window.location.hash = '#/intake'
    window.setTimeout(() => window.dispatchEvent(new CustomEvent('calibre:import-invoice')), 80)
  }

  function addPart() {
    onClose()
    window.location.hash = '#/items'
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('calibre:inventory-view', { detail: 'parts' }))
      window.setTimeout(() => window.dispatchEvent(new CustomEvent('calibre:add-part')), 40)
    }, 70)
  }

  function startWork() {
    onClose()
    window.location.hash = '#/items'
    window.setTimeout(() => window.dispatchEvent(new CustomEvent('calibre:choose-item-for-work')), 60)
  }

  return (
    <div className="universal-new-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section ref={sheetRef} className="universal-new-sheet" role="dialog" aria-modal="true" aria-labelledby="universal-new-title">
        <div className="universal-new-heading">
          <div>
            <p className="eyebrow">NEW</p>
            <h2 id="universal-new-title">What are you adding?</h2>
            <p className="muted">Choose what to add to your workshop.</p>
          </div>
          <button type="button" className="secondary small" onClick={onClose}>Close</button>
        </div>

        <div className="universal-new-grid">
          <button type="button" onClick={createItem}>
            <span className="universal-new-icon">◫</span>
            <span><strong>Item</strong><small>Watch, clock, jewellery, accessory or donor Item.</small></span>
          </button>
          <button type="button" onClick={importInvoice}>
            <span className="universal-new-icon">↧</span>
            <span><strong>Invoice / purchase</strong><small>Upload a purchase document and turn it into reviewed Items.</small></span>
          </button>
          <button type="button" onClick={addPart}>
            <span className="universal-new-icon">◇</span>
            <span><strong>Part</strong><small>Add loose stock, salvaged parts or donor-sourced components.</small></span>
          </button>
          <button type="button" onClick={startWork}>
            <span className="universal-new-icon">⌁</span>
            <span><strong>Work</strong><small>Choose an Item and open its Job Card when it enters the workshop.</small></span>
          </button>
        </div>
      </section>
    </div>
  )
}
