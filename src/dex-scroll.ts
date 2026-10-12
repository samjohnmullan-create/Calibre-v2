function enableWorkbenchMouseWheel() {
  window.addEventListener(
    'wheel',
    (event) => {
      if (event.ctrlKey) return

      const hovered = document.elementFromPoint(event.clientX, event.clientY)
      const board = hovered?.closest<HTMLElement>('.workbench-board')
      if (!board) return
      if (board.scrollWidth <= board.clientWidth + 1) return

      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      if (!delta) return

      const maxScroll = board.scrollWidth - board.clientWidth
      const next = Math.max(0, Math.min(maxScroll, board.scrollLeft + delta))
      if (next === board.scrollLeft) return

      event.preventDefault()
      board.scrollLeft = next
    },
    { passive: false, capture: true },
  )
}

enableWorkbenchMouseWheel()
