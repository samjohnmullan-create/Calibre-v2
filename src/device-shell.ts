function applyDeviceShell() {
  const root = document.documentElement
  const shortSide = Math.min(window.screen.width, window.screen.height)
  const longSide = Math.max(window.screen.width, window.screen.height)
  const isPhoneScreen = shortSide <= 600 && longSide <= 1100

  root.classList.toggle('phone-shell', isPhoneScreen)
}

applyDeviceShell()
window.addEventListener('resize', applyDeviceShell)
window.addEventListener('orientationchange', applyDeviceShell)
