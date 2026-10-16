type CalibreBrandMarkProps = {
  className?: string
  title?: string
}

export default function CalibreBrandMark({ className = '', title = 'Calibre & Co.' }: CalibreBrandMarkProps) {
  return (
    <svg
      className={`calibre-brand-mark ${className}`.trim()}
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      <polygon
        points="32,5 36,16.5 48.5,16.8 38.5,24.2 42,36 32,29 22,36 25.5,24.2 15.5,16.8 28,16.5"
        fill="currentColor"
      />
      <path
        d="M8 39C10.3 51.4 19.4 59 32 59s21.7-7.6 24-20c-6 8.6-13.9 13-24 13S14 47.6 8 39Z"
        fill="currentColor"
      />
    </svg>
  )
}
