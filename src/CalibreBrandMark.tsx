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
        points="32,7 36.7,20.8 51.4,21 39.5,29.7 44.2,43.6 32,35.2 19.8,43.6 24.5,29.7 12.6,21 27.3,20.8"
        fill="currentColor"
      />
      <path
        d="M7.8 30.4C9.4 48.1 18.4 57 32 57s22.6-8.9 24.2-26.6c-5.5 10.9-13.5 16.6-24.2 16.6S13.3 41.3 7.8 30.4Z"
        fill="currentColor"
      />
    </svg>
  )
}
