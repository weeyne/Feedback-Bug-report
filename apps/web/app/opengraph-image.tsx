import { ImageResponse } from 'next/og';
import { ladybugDetailedSvg } from '@/components/brand/ladybug-svg';
import en from '@/messages/en.json';

export const alt = 'Bugping';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Manrope 800 subset for the given text; null when Google Fonts is unreachable (then the default font is used). */
async function manrope(text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (
      await fetch(
        `https://fonts.googleapis.com/css2?family=Manrope:wght@800&text=${encodeURIComponent(text)}`,
      )
    ).text();
    const url = /src: url\((.+?)\) format\('(?:opentype|truetype)'\)/.exec(css)?.[1];
    if (!url) return null;
    const response = await fetch(url);
    return response.ok ? await response.arrayBuffer() : null;
  } catch {
    return null;
  }
}

export default async function OpengraphImage() {
  const tagline = en.meta.description;
  const font = await manrope(`bugping${tagline}`);
  const mark = `data:image/svg+xml;base64,${Buffer.from(ladybugDetailedSvg('og')).toString('base64')}`;
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: 96,
        background: '#fbf4f1',
        color: '#1a1414',
        fontFamily: font ? 'Manrope' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mark} width={140} height={140} alt="" />
        <div style={{ fontSize: 120, fontWeight: 800, letterSpacing: -4 }}>bugping</div>
      </div>
      <div style={{ marginTop: 40, fontSize: 44, fontWeight: 800, lineHeight: 1.2, maxWidth: 960 }}>
        {tagline}
      </div>
      <div
        style={{
          position: 'absolute',
          right: 96,
          top: 96,
          width: 28,
          height: 28,
          borderRadius: 14,
          background: '#ff4d3d',
        }}
      />
    </div>,
    { ...size, fonts: font ? [{ name: 'Manrope', data: font, weight: 800, style: 'normal' }] : [] },
  );
}
