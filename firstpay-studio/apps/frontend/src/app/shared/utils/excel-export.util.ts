import ExcelJS from 'exceljs';

export interface ExcelColumn {
  header: string;
  key: string;
  width?: number;
}

/**
 * Génère un vrai fichier .xlsx (pas du CSV déguisé) : en-tête en gras sur fond marque,
 * figée en haut, colonnes dimensionnées, lignes alternées, bordures fines. Déclenche le
 * téléchargement directement dans le navigateur.
 */
export async function exportToExcel(
  filename: string,
  sheetName: string,
  columns: ExcelColumn[],
  rows: Record<string, string | number>[],
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'First Collect — Afriland First Bank';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 20 }));

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F334D' } };
  headerRow.alignment = { vertical: 'middle' };
  headerRow.height = 20;

  rows.forEach((r) => sheet.addRow(r));

  sheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E5EA' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E5EA' } },
      };
      cell.alignment = { vertical: 'middle', ...(rowNumber === 1 ? { horizontal: 'left' } : {}) };
    });
    if (rowNumber > 1 && rowNumber % 2 === 0) {
      row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F8FA' } }; });
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  a.click();
  URL.revokeObjectURL(a.href);
}
