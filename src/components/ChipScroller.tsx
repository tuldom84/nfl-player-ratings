import type { ReactNode } from 'react'

/** Horizontal chip row on mobile with a right-edge fade; wraps on desktop. */
export default function ChipScroller({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`relative ${className}`}>
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 lg:flex-wrap lg:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 right-0 bottom-2 w-8 bg-gradient-to-l from-slate-950 to-transparent lg:hidden"
      />
    </div>
  )
}
