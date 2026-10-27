export function csvCell(value: unknown): string {
  let text = value == null ? '' : String(value);
  // Leading whitespace and control characters can hide spreadsheet formulas.
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function toCsv(rows: unknown[][]): string {
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export function downloadFile(filename: string, contents: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const koreanDate = (date: string) =>
  new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(date));
