'use client';

import { useEffect, useMemo, useState } from 'react';

type DateLike = string | number | Date | null | undefined;

const normaliseDate = (value: DateLike): Date | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const candidate = new Date(value);
  return Number.isNaN(candidate.getTime()) ? null : candidate;
};

const computeFallback = (value: DateLike, fallback?: string): string => {
  const date = normaliseDate(value);
  if (!date) {
    return fallback ?? '';
  }
  return date.toISOString();
};

/**
 * Returns a locale-aware date string that only hydrates on the client.
 * Server render falls back to ISO to avoid hydration mismatches.
 */
export function useClientLocaleString(
  value: DateLike,
  options?: Intl.DateTimeFormatOptions,
  fallback?: string,
): string {
  const initial = useMemo(() => computeFallback(value, fallback), [value, fallback]);
  const [formatted, setFormatted] = useState(initial);

  useEffect(() => {
    setFormatted(initial);
  }, [initial]);

  useEffect(() => {
    const date = normaliseDate(value);
    if (!date) {
      if (fallback !== undefined) {
        setFormatted(fallback);
      }
      return;
    }

    try {
      const next = options ? date.toLocaleString(undefined, options) : date.toLocaleString();
      setFormatted(next);
    } catch (error) {
      console.warn('Failed to format date with locale options, falling back to ISO.', error);
      setFormatted(date.toISOString());
    }
  }, [value, options, fallback]);

  return formatted;
}
