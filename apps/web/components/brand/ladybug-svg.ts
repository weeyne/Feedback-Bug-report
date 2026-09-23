/** Simplified ladybug for 16–32 px (favicon, apple icon). */
export const ladybugSimpleSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
  '<path d="M9 9.5 a7 6 0 0 1 14 0 z" fill="#1a1414"/>' +
  '<circle cx="16" cy="19" r="12" fill="#ff4d3d"/>' +
  '<path d="M16 9 L16 31" stroke="#1a1414" stroke-width="2.2"/>' +
  '<path d="M9 10 Q16 7 23 10 Q16 13 9 10Z" fill="#1a1414"/>' +
  '<circle cx="10.5" cy="17" r="2.6" fill="#1a1414"/><circle cx="21.5" cy="17" r="2.6" fill="#1a1414"/>' +
  '<circle cx="11.5" cy="25" r="2.2" fill="#1a1414"/><circle cx="20.5" cy="25" r="2.2" fill="#1a1414"/>' +
  '</svg>';

/** Detailed ladybug; `ink` colors legs, antennae and the head outline. */
export function ladybugDetailedSvg(gradientId: string, ink = '#1a1414'): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<defs><radialGradient id="${gradientId}" cx="35%" cy="30%" r="75%">` +
    `<stop offset="0" stop-color="#ff7a6b"/><stop offset=".55" stop-color="#ff4d3d"/><stop offset="1" stop-color="#d9321f"/>` +
    `</radialGradient></defs>` +
    `<g stroke="${ink}" stroke-width="2.4" stroke-linecap="round" fill="none">` +
    `<path d="M14 28 L6 24"/><path d="M12 38 L4 39"/><path d="M15 48 L8 54"/>` +
    `<path d="M50 28 L58 24"/><path d="M52 38 L60 39"/><path d="M49 48 L56 54"/>` +
    `<path d="M27 12 Q23 4 17 4"/><path d="M37 12 Q41 4 47 4"/></g>` +
    `<circle cx="17" cy="4.2" r="2.3" fill="${ink}"/><circle cx="47" cy="4.2" r="2.3" fill="${ink}"/>` +
    `<path d="M21 17 a11 9 0 0 1 22 0 z" fill="#1a1414" stroke="${ink}" stroke-width="1"/>` +
    `<circle cx="27.5" cy="13.5" r="2" fill="#fff"/><circle cx="36.5" cy="13.5" r="2" fill="#fff"/>` +
    `<path d="M32 18 C14 18 10 32 10 38 C10 51 20 59 31 59.5 L32 20 Z" fill="url(#${gradientId})"/>` +
    `<path d="M32 18 C50 18 54 32 54 38 C54 51 44 59 33 59.5 L32 20 Z" fill="url(#${gradientId})"/>` +
    `<path d="M22 19 Q32 15 42 19 Q37 23 32 23 Q27 23 22 19Z" fill="#1a1414"/>` +
    `<ellipse cx="25" cy="20" rx="2.6" ry="1.4" fill="#fff" opacity=".9"/>` +
    `<ellipse cx="39" cy="20" rx="2.6" ry="1.4" fill="#fff" opacity=".9"/>` +
    `<path d="M32 21 L32 59.5" stroke="#1a1414" stroke-width="1.6"/>` +
    `<circle cx="21" cy="31" r="4" fill="#1a1414"/><circle cx="43" cy="31" r="4" fill="#1a1414"/>` +
    `<circle cx="17.5" cy="43" r="3.2" fill="#1a1414"/><circle cx="46.5" cy="43" r="3.2" fill="#1a1414"/>` +
    `<circle cx="25.5" cy="51" r="2.8" fill="#1a1414"/><circle cx="38.5" cy="51" r="2.8" fill="#1a1414"/>` +
    `<circle cx="27" cy="40" r="2.2" fill="#1a1414"/><circle cx="37" cy="40" r="2.2" fill="#1a1414"/>` +
    `<ellipse cx="20" cy="26" rx="5" ry="2.6" fill="#fff" opacity=".35" transform="rotate(-35 20 26)"/>` +
    `</svg>`
  );
}
