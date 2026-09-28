import { Skeleton } from '@/components/ui/skeleton';

export default function ProjectLoading() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6" aria-busy="true">
      <header className="flex flex-col gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-56" />
      </header>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
      </div>
    </div>
  );
}
