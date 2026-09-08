/**
 * Reçus clients en PDF (point 13) — générateur minimaliste sans dépendance.
 *
 * Produit un PDF 1.4 valide (polices standard Helvetica / Helvetica-Bold,
 * encodage WinAnsi) : aucun paquet externe, fonctionne partout, y compris en
 * environnement serverless. La mise en page est volontairement simple : un
 * en-tête de marque, un bloc client, le tableau des articles, les totaux et
 * les règlements.
 */

export type ReceiptLine = { label: string; quantity: number; unitPrice: number; total: number };

export type ReceiptData = {
  brandName: string;
  brandAddress?: string | null;
  storeName?: string | null;
  title: string;
  reference: string;
  date: Date;
  currency: string;
  customerName?: string | null;
  customerPhone?: string | null;
  items: ReceiptLine[];
  deliveryFee?: number;
  deliveryLabel?: string | null;
  discount?: number;
  discountLabel?: string | null;
  totalNet: number;
  payments: Array<{ label: string; amount: number }>;
  shopUrl?: string | null;
};

/** Montant « 125 000 XOF » avec espaces insécables simples (compatibles PDF). */
export function formatReceiptAmount(amount: number, currency: string): string {
  const rounded = Math.round(amount * 100) / 100;
  const text = rounded.toLocaleString("fr-FR", { minimumFractionDigits: rounded % 1 !== 0 ? 2 : 0, maximumFractionDigits: 2 });
  return `${text.replace(/[\u202f\u00a0]/g, " ")} ${currency}`;
}

/** Encode une chaîne pour un flux PDF (parenthèses, antislash, WinAnsi). */
export function escapePdfText(text: string): string {
  let out = "";
  for (const char of text.normalize("NFC")) {
    const code = char.codePointAt(0)!;
    if (char === "\u2212") out += "-";
    else if (char === "\u2014" || char === "\u2013") out += "-";
    else if (char === "\u2019" || char === "\u2018") out += "'";
    else if (char === "\u00a0" || char === "\u202f") out += " ";
    else if (char === "(" || char === ")" || char === "\\") out += `\\${char}`;
    else if (code >= 32 && code <= 126) out += char;
    else if (code >= 160 && code <= 255) out += `\\${code.toString(8).padStart(3, "0")}`;
    else if (code === 8364) out += "\\200"; // € en WinAnsi (0x80)
    else out += "?";
  }
  return out;
}

type Row = { text: string; size?: number; bold?: boolean; align?: "left" | "right"; x?: number; gapAfter?: number };

function approximateWidth(text: string, size: number): number {
  // Helvetica : largeur moyenne ≈ 0,52 em — suffisant pour aligner un reçu.
  return text.length * size * 0.52;
}

/** Construit un PDF (Buffer) à partir des lignes mises en page. */
export function buildPdf(rows: Row[], pageWidth = 595, pageHeight = 842): Buffer {
  const margin = 42;
  const parts: string[] = [];
  let y = pageHeight - margin;
  for (const row of rows) {
    const size = row.size ?? 10;
    const x = row.x ?? (row.align === "right" ? pageWidth - margin - approximateWidth(row.text, size) : margin);
    parts.push(`BT /${row.bold ? "F2" : "F1"} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${escapePdfText(row.text)}) Tj ET`);
    y -= size * 1.25 + (row.gapAfter ?? 0);
    if (y < margin) break;
  }
  const stream = parts.join("\n");
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

/** Reçu complet (vente boutique ou commande en ligne) sur une page A5 paysage. */
export function buildReceiptPdf(data: ReceiptData): Buffer {
  const pageWidth = 595;
  const rows: Row[] = [];
  const push = (text: string, size = 10, opts: Partial<Row> = {}) => rows.push({ text, size, bold: false, align: "left", gapAfter: 0, ...opts });

  push(data.brandName.toUpperCase(), 16, { bold: true, gapAfter: 2 });
  if (data.storeName) push(data.storeName, 10, { gapAfter: 2 });
  if (data.brandAddress) push(data.brandAddress, 9, { gapAfter: 10 });
  else rows[rows.length - 1].gapAfter = 10;
  push(data.title.toUpperCase(), 13, { bold: true, gapAfter: 2 });
  push(`N° ${data.reference} — ${data.date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })}`, 10, { gapAfter: 12 });

  if (data.customerName) push(`Client : ${data.customerName}${data.customerPhone ? ` — ${data.customerPhone}` : ""}`, 10, { gapAfter: 12 });

  // Tableau des articles
  rows.push({ text: "Article", size: 9, bold: true, align: "left", gapAfter: 1 });
  rows.push({ text: "Total", size: 9, bold: true, align: "right", gapAfter: 3 });
  for (const item of data.items) {
    push(`${item.quantity} × ${item.label} @ ${formatReceiptAmount(item.unitPrice, data.currency)}`, 10);
    rows.push({ text: formatReceiptAmount(item.total, data.currency), size: 10, align: "right", gapAfter: 2 });
  }
  if (data.deliveryFee && data.deliveryFee > 0) {
    push(data.deliveryLabel ?? "Frais de livraison", 10);
    rows.push({ text: formatReceiptAmount(data.deliveryFee, data.currency), size: 10, align: "right", gapAfter: 2 });
  }
  const gross = data.items.reduce((sum, item) => sum + item.total, 0) + (data.deliveryFee ?? 0);
  if (data.discount && data.discount > 0) {
    push(data.discountLabel ?? "Réduction parrainage", 10);
    rows.push({ text: `− ${formatReceiptAmount(Math.min(data.discount, gross), data.currency)}`, size: 10, align: "right", gapAfter: 2 });
  }
  rows[rows.length - 1].gapAfter = 4;
  push("NET À PAYER", 12, { bold: true });
  rows.push({ text: formatReceiptAmount(data.totalNet, data.currency), size: 12, bold: true, align: "right", gapAfter: 10 });

  if (data.payments.length) {
    push("Règlements", 9, { bold: true, gapAfter: 2 });
    for (const payment of data.payments) {
      push(payment.label, 10);
      rows.push({ text: formatReceiptAmount(payment.amount, data.currency), size: 10, align: "right", gapAfter: 2 });
    }
    const paid = data.payments.reduce((sum, payment) => sum + payment.amount, 0);
    if (paid < data.totalNet - 0.01) {
      push("Reste à payer", 10, { bold: true });
      rows.push({ text: formatReceiptAmount(data.totalNet - paid, data.currency), size: 10, bold: true, align: "right", gapAfter: 2 });
    }
  }
  rows[rows.length - 1].gapAfter = 18;
  push("Merci de votre confiance !", 10, { bold: true, gapAfter: 2 });
  if (data.shopUrl) push(`Suivi de commande en ligne : ${data.shopUrl}`, 9);

  return buildPdf(rows, pageWidth, 842);
}
