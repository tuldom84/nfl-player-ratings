import { useMemo, useState } from 'react'
import {
  optimizeHeadshotUrl,
  headshotDisplayPx,
  type HeadshotSize,
} from '../lib/headshot'

const sizeCls: Record<HeadshotSize, string> = {
  sm: 'w-9 h-9 text-[10px]',
  md: 'w-12 h-12 text-sm',
  lg: 'w-16 h-16 text-xl',
}

/** ESPN player headshot with position-letter fallback and sized CDN requests. */
export function PlayerHeadshot({
  src,
  name,
  position,
  size = 'md',
  className = '',
  priority = false,
}: {
  src?: string | null
  name?: string
  position?: string
  size?: HeadshotSize
  className?: string
  /** Eager-load for above-the-fold detail headers. */
  priority?: boolean
}) {
  const [stage, setStage] = useState<'optimized' | 'original' | 'done'>('optimized')
  const optimized = useMemo(() => optimizeHeadshotUrl(src, size), [src, size])
  const original = src || undefined

  const activeSrc =
    stage === 'optimized' ? optimized : stage === 'original' ? original : undefined
  const showImg = Boolean(activeSrc)
  const px = headshotDisplayPx(size)

  function onError() {
    if (stage === 'optimized' && original && original !== optimized) {
      setStage('original')
      return
    }
    setStage('done')
  }

  return (
    <div
      className={`flex-shrink-0 rounded-full bg-slate-800 overflow-hidden flex items-center justify-center font-bold text-slate-400 ${sizeCls[size]} ${className}`}
    >
      {showImg ? (
        <img
          key={activeSrc}
          src={activeSrc}
          alt={name || position || 'Player'}
          width={px}
          height={px}
          className="w-full h-full object-cover object-top"
          loading={priority ? 'eager' : 'lazy'}
          decoding={priority ? 'sync' : 'async'}
          fetchPriority={priority ? 'high' : 'low'}
          referrerPolicy="no-referrer"
          onError={onError}
        />
      ) : (
        <span>{position || '?'}</span>
      )}
    </div>
  )
}
