const SVG_NS = 'http://www.w3.org/2000/svg';

/** A 24×24 stroke icon built with createElementNS (never parsed from markup); hidden from AT. */
function icon(name: string, d: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const attrs: Record<string, string> = {
    class: `bp-icon bp-icon-${name}`,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
  };
  for (const [key, value] of Object.entries(attrs)) svg.setAttribute(key, value);
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
}

export const chatIcon = () =>
  icon('chat', 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z');
export const closeIcon = () => icon('close', 'M18 6 6 18M6 6l12 12');
export const backIcon = () => icon('back', 'M15 18l-6-6 6-6');
export const chevronIcon = () => icon('chevron', 'M9 18l6-6-6-6');

/** The check path has `pathLength=1`, so CSS can draw it with a unit stroke-dashoffset. */
export function checkIcon(): SVGSVGElement {
  const svg = icon('check', 'M6 12.5l4 4 8-9');
  const path = svg.firstElementChild;
  path?.setAttribute('class', 'bp-check-path');
  path?.setAttribute('pathLength', '1');
  return svg;
}
