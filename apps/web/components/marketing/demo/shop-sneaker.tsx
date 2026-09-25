/** The demo store's product: a side-view running shoe drawn with SVG (no images). */
export function ShopSneaker({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 420 230" className={className} aria-hidden="true">
      {/* Upper */}
      <path
        d="M60 168 C56 140 58 110 64 92 C66 82 70 76 78 76 C84 76 86 84 92 90 C108 102 128 104 146 96 C158 84 166 62 176 52 C184 44 196 44 204 52 L270 116 C300 124 340 128 364 138 C382 146 392 156 390 168 Z"
        className="fill-indigo-600 dark:fill-indigo-500"
      />
      {/* Toe cap */}
      <path
        d="M300 124 C336 128 366 136 380 148 C388 154 391 160 390 168 L312 168 C304 152 300 138 300 124 Z"
        className="fill-indigo-800 dark:fill-indigo-700"
      />
      {/* Heel counter */}
      <path
        d="M60 168 C56 140 58 110 64 92 C66 82 70 76 78 76 C84 76 86 84 92 90 C96 120 100 146 104 168 Z"
        className="fill-indigo-800 dark:fill-indigo-700"
      />
      {/* Collar opening */}
      <path
        d="M90 90 C106 101 128 103 146 96 C140 89 124 84 110 84 C100 84 94 86 90 90 Z"
        className="fill-indigo-950 dark:fill-zinc-950"
      />
      {/* Side stripe */}
      <path
        d="M112 152 C150 126 200 112 262 120 C230 126 192 138 164 160 Z"
        className="fill-white/85 dark:fill-zinc-100/85"
      />
      {/* Eyelets and laces */}
      <g className="stroke-white dark:stroke-zinc-100" strokeWidth="5" strokeLinecap="round">
        <path d="M190 69 L201 55" />
        <path d="M206 82 L217 68" />
        <path d="M222 94 L233 80" />
        <path d="M238 107 L249 93" />
      </g>
      {/* Midsole */}
      <path
        d="M46 164 L390 164 C402 164 410 172 408 182 C406 192 396 196 382 196 L62 198 C48 198 40 190 40 180 C40 172 41 166 46 164 Z"
        className="fill-white stroke-zinc-300 dark:fill-zinc-100 dark:stroke-zinc-400"
        strokeWidth="2"
      />
      <path
        d="M68 182 L384 180"
        className="stroke-zinc-300 dark:stroke-zinc-400"
        strokeWidth="2"
        strokeDasharray="10 8"
        strokeLinecap="round"
      />
      {/* Outsole */}
      <path
        d="M42 190 C48 200 56 204 68 204 L380 202 C394 202 404 196 408 184 C408 198 396 210 380 210 L68 212 C52 212 44 202 42 190 Z"
        className="fill-zinc-800 dark:fill-zinc-600"
      />
    </svg>
  );
}
