function enableWorkbenchMouseWheel() {
  document.addEventListener(
    'wheel',
    (event) => {
      if (event.ctrlKey) return
      if (!(event.target instanceof Element)) return

      const board = event.target.closest<HTMLElement>('.workbench-board')
      if (!board) return
      if (window.matchMedia('(max-width: 900px)').matches) return
      if (board.scrollWidth <= board.clientWidth) return

      const horizontalIntent = Math.abs(event.deltaX) > Math.abs(event.deltaY)
      const delta = horizontalIntent ? event.deltaX : event.deltaY
      if (!delta) return

      const atStart = board.scrollLeft <= 0
      const atEnd = Math.ceil(board.scrollLeft + board.clientWidth) >= board.scrollWidth
      if ((delta < 0 && atStart) || (delta > 0 && atEnd)) return

      event.preventDefault()
      board.scrollLeft += delta
    },
    { passive: false },
  )
}

enableWorkbenchMouseWheel()
