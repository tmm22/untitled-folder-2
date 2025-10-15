import { formatAppVersion, getAppVersionInfo } from '@/lib/utils/version';

export function AppVersionBadge() {
  const info = getAppVersionInfo();
  const readableVersion = formatAppVersion(info);

  return (
    <footer className="mt-16 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-charcoal-50 px-5 py-3 text-xs text-charcoal-600">
      <span className="font-semibold uppercase tracking-[0.35em] text-charcoal-400">Build</span>
      <span className="font-medium text-charcoal-800">{readableVersion}</span>
      <span className="text-charcoal-400">{info.isFallback ? 'Local development build' : info.build}</span>
    </footer>
  );
}
