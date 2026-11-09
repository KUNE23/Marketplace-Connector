// Backend/src/utils/csv.js
// Helper sederhana untuk membuat CSV yang aman dibuka di Excel.
function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  // Kutip bila mengandung koma, kutip, newline, atau titik koma.
  if (/[",\n\r;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** rows: array of array. Mengembalikan string CSV (CRLF). */
function toCsv(rows) {
  return rows.map((row) => row.map(csvEscape).join(',')).join('\r\n');
}

module.exports = { toCsv, csvEscape };
