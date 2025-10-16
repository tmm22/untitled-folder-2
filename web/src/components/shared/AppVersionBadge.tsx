import { useState } from 'react';
import { formatAppVersion, getAppVersionInfo } from '@/lib/utils/version';

export function AppVersionBadge() {
  const info = getAppVersionInfo();
  const readableVersion = formatAppVersion(info);
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <section className="mt-12 flex flex-col items-center gap-2 text-xs text-charcoal-500">
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="rounded-full border border-charcoal-200 px-4 py-2 font-medium text-charcoal-500 transition-colors hover:bg-charcoal-50 focus:outline-none focus:ring-2 focus:ring-accent-300 focus:ring-offset-2"
      >
        {isExpanded ? 'Hide build details' : 'Show build details'}
      </button>
      {isExpanded && (
        <div className="flex flex-wrap items-center justify-center gap-3 rounded-2xl bg-charcoal-50 px-5 py-3 text-charcoal-600">
          <span className="font-semibold uppercase tracking-[0.35em] text-charcoal-400">Build</span>
          <span className="font-medium text-charcoal-800">{readableVersion}</span>
          <span className="text-charcoal-400">{info.isFallback ? 'Local development build' : info.build}</span>
        </div>
      )}
    </section>
  );
}
