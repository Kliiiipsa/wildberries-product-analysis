import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: 32,
        height: 32,
        background: '#0f172a',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        gap: 3,
        padding: '5px 5px 5px 5px',
      }}
    >
      <div style={{ width: 5, height: 8,  background: '#6366f1', borderRadius: 2, display: 'flex' }} />
      <div style={{ width: 5, height: 14, background: '#818cf8', borderRadius: 2, display: 'flex' }} />
      <div style={{ width: 5, height: 18, background: '#3b82f6', borderRadius: 2, display: 'flex' }} />
      <div style={{ width: 5, height: 11, background: '#60a5fa', borderRadius: 2, display: 'flex' }} />
    </div>,
    { ...size }
  );
}
