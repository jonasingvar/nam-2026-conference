/*
 * The app the room actually uses — GitHub, drawn light the way it looks —
 * shared by the opening, the receipts and the lab, so they never drift apart.
 */

/*
 * GitHub, drawn light the way the room sees it: the repo header and its tabs,
 * then a page. Close enough to recognise, not a copy.
 */
export const GH = {
  ink: 'text-[#1f2328]', muted: 'text-[#59636e]', line: 'border-[#d1d9e0]',
  open: 'text-[#1a7f37]', green: 'bg-[#1f883d]', link: 'text-[#0969da]',
};

export function GhOpenIcon({ className = 'size-4' }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden="true">
      <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" /><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z" />
    </svg>
  );
}

const GH_TABS = [['‹›', 'Code'], ['◉', 'Issues', 2], ['⇅', 'Pull requests', 1], ['▷', 'Actions']];

export function GitHub({ tab, children, className = '' }) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-black/10 bg-white ${GH.ink} shadow-2xl shadow-black/50 ${className}`}>
      <div className={`border-b ${GH.line} bg-[#f6f8fa] px-5 pt-3`}>
        <div className="flex items-center gap-3 text-[16px]">
          <span className="size-7 rounded-full bg-[#1f2328]" aria-hidden="true" />
          <span className={GH.muted}>you</span><span className={GH.muted}>/</span><span className="font-semibold">nam-2026-conference</span>
          <span className={`ml-auto rounded-md border ${GH.line} bg-white px-3 py-1 text-[13px] ${GH.muted}`}>Type / to search</span>
        </div>
        <div className="mt-2 flex gap-6 text-[14px]">
          {GH_TABS.map(([icon, name, n]) => (
            <span key={name} className={`flex items-center gap-1.5 border-b-2 pb-2 ${name === tab ? 'border-[#fd8c73] font-semibold' : `border-transparent ${GH.muted}`}`}>
              <span className="text-[12px] opacity-70">{icon}</span>{name}
              {n && <span className="rounded-full bg-black/[0.07] px-1.5 text-[12px]">{n}</span>}
            </span>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}
