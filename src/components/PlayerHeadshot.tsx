import { useState } from 'react'

type Size = 'sm' | 'md' | 'lg'

const sizeCls: Record<Size, string> = {
  sm: 'w-9 h-9 text-[10px]',
  md: 'w-12 h-12 text-sm',
  lg: 'w-16 h-16 text-xl',
}

/** ESPN player headshot with position-letter fallback. */
export function PlayerHeadshot({
  src,
  name,
  position,
  size = 'md',
  className = '',
}: {
  src?: string | null
  name?: string
  position?: string
  size?: Size
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const showImg = Boolean(src) && !failed

  return (
    <div
      className={`flex-shrink-0 rounded-full bg-slate-800 overflow-hidden flex items-center justify-center font-bold text-slate-400 ${sizeCls[size]} ${className}`}
    >
      {showImg ? (
        <img
          src={src!}
          alt={name || position || 'Player'}
          className="w-full h-full object-cover object-top"
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <span>{position || '?'}</span>
      )}
    </div>
  )
}
