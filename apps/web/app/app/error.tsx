'use client';

import { ErrorScreen } from '@/components/error-screen';

export default function DashboardError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <ErrorScreen error={error} retry={retry} embedded />;
}
