'use client';

import type { ReactNode } from 'react';
import { useClientLocaleString } from '@/lib/hooks/useClientLocaleString';

interface FormattedTimestampProps {
  value?: string | number | Date | null;
  options?: Intl.DateTimeFormatOptions;
  placeholder?: ReactNode;
  className?: string;
}

export function FormattedTimestamp({
  value = null,
  options,
  placeholder = '—',
  className,
}: FormattedTimestampProps) {
  const display = useClientLocaleString(value, options, typeof placeholder === 'string' ? placeholder : undefined);

  if (!display) {
    return placeholder ? <span className={className}>{placeholder}</span> : null;
  }

  return <span className={className}>{display}</span>;
}
