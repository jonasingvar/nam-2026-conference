'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Re-render the server page every 10 s while anything is running. */
export function Refresh({ live }: { live: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(id);
  }, [live, router]);
  return null;
}
