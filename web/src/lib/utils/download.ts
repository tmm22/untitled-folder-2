export function triggerDownloadFromUrl(url: string, filename: string) {
  if (typeof document === 'undefined') {
    return;
  }

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function triggerDownloadText(content: string, filename: string, mimeType = 'text/plain;charset=utf-8') {
  if (typeof document === 'undefined') {
    return;
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  triggerDownloadFromUrl(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
