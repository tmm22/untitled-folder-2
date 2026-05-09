'use client';

import { useMemo, useSyncExternalStore } from 'react';

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

const formatLocaleDate = (
  value: DateLike,
  options?: Intl.DateTimeFormatOptions,
  fallback?: string,
): string => {
  const date = normaliseDate(value);
  if (!date) {
    return fallback ?? '';
  }

  try {
    return options ? new Intl.DateTimeFormat(undefined, options).format(date) : date.toLocaleString();
  } catch (error) {
    console.warn('Failed to format date with locale options, falling back to ISO.', error);
    return date.toISOString();
  }
};

const subscribeToLocaleChanges = () => () => {};

const serializeOptions = (options?: Intl.DateTimeFormatOptions): string | null => {
  if (!options) {
    return null;
  }
  try {
    return JSON.stringify(options, Object.keys(options).sort());
  } catch {
    return '__UNKNOWN__';
  }
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
  const optionsKey = useMemo(() => serializeOptions(options), [options]);
  const stableOptions = useMemo(() => {
    if (!optionsKey) {
      return undefined;
    }
    try {
      return JSON.parse(optionsKey) as Intl.DateTimeFormatOptions;
    } catch {
      return undefined;
    }
  }, [optionsKey]);

  const fallbackValue = useMemo(() => computeFallback(value, fallback), [value, fallback]);
  const localeValue = useMemo(
    () => formatLocaleDate(value, stableOptions, fallback),
    [value, fallback, stableOptions],
  );

  return useSyncExternalStore(
    subscribeToLocaleChanges,
    () => localeValue,
    () => fallbackValue,
  );
}
