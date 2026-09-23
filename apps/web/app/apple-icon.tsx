import { ImageResponse } from 'next/og';
import { ladybugSimpleSvg } from '@/components/brand/ladybug-svg';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  const src = `data:image/svg+xml;base64,${Buffer.from(ladybugSimpleSvg).toString('base64')}`;
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#fffdfb',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} width={132} height={132} alt="" />
    </div>,
    size,
  );
}
