'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <html lang="en">
      <head>
        <title>Error · Bugping</title>
      </head>
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          padding: 16,
          textAlign: 'center',
          fontFamily: 'system-ui, sans-serif',
          colorScheme: 'light dark',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>
          Something went wrong / Что-то пошло не так
        </h1>
        {error.digest && (
          <p style={{ margin: 0, fontSize: 12, opacity: 0.6 }}>Error code: {error.digest}</p>
        )}
        <button
          type="button"
          onClick={() => retry()}
          style={{
            marginTop: 8,
            padding: '8px 16px',
            borderRadius: 8,
            border: '1px solid currentColor',
            background: 'transparent',
            color: 'inherit',
            font: 'inherit',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Reload / Обновить
        </button>
      </body>
    </html>
  );
}
