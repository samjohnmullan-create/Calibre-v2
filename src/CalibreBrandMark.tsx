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
        points="32,5 38.4,23 57.5,23.4 42,34.7 47.4,53 32,42.2 16.6,53 22,34.7 6.5,23.4 25.6,23"
        fill="currentColor"
      />
      <path
        d="M7.5 27.2C8.8 48.6 18.7 59 32 59s23.2-10.4 24.5-31.8c-5.3 15.2-13.5 22.2-24.5 22.2S12.8 42.4 7.5 27.2Z"
        fill="currentColor"
      />
    </svg>
  )
}
