// ساخت و دانلود فایل در مرورگر (CSV با BOM برای اکسل فارسی)

export function downloadBlob(filename, content, mime){
  const blob = new Blob([content], {type: mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
export function toCSV(rows, columns){
  const esc = v => '"' + String(v==null?'':v).replace(/"/g,'""') + '"';
  const head = columns.map(c=>esc(c)).join(',');
  const body = rows.map(r => columns.map(c=>esc(r[c])).join(',')).join('\n');
  return head + '\n' + body;
}
export function downloadCsv(filename, rows, columns){
  // BOM اول فایل: بدونش اکسل متن فارسی رو به‌هم‌ریخته نشون می‌ده
  downloadBlob(filename, '\ufeff' + toCSV(rows, columns), 'text/csv;charset=utf-8');
}

