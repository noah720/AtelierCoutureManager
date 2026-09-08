/**
 * Envoi d'e-mails (reçus clients, point 13) — sans dépendance obligatoire.
 *
 * Deux fournisseurs, dans l'ordre :
 *  1. `RESEND_API_KEY` → API HTTP Resend (fetch natif, pièce jointe en base64) ;
 *  2. `SMTP_HOST` (+ `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`) →
 *     nodemailer s'il est installé ;
 *  3. sinon **mode simulation** : l'e-mail est journalisé côté serveur et le
 *     statut « simulation » est renvoyé — l'application reste utilisable en
 *     démonstration sans fournisseur d'e-mail.
 */
export type EmailResult = { status: "envoye" | "simulation" | "erreur"; detail?: string };

export async function sendEmail(opts: { to: string; subject: string; text: string; attachment?: { filename: string; base64: string } }): Promise<EmailResult> {
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: process.env.SMTP_FROM ?? "AtelierManager <recus@resend.dev>",
          to: [opts.to],
          subject: opts.subject,
          text: opts.text,
          ...(opts.attachment ? { attachments: [{ filename: opts.attachment.filename, content: opts.attachment.base64 }] } : {}),
        }),
      });
      clearTimeout(timer);
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 300);
        return { status: "erreur", detail };
      }
      return { status: "envoye" };
    } catch (error) {
      return { status: "erreur", detail: String((error as Error)?.message ?? error).slice(0, 300) };
    }
  }

  const smtpHost = process.env.SMTP_HOST;
  if (smtpHost) {
    try {
      // Import dynamique opaque : nodemailer est optionnel (pas dans package.json).
      const moduleName = "nodemailer";
      const nodemailer = await import(moduleName).catch(() => null);
      if (!nodemailer?.createTransport) {
        return { status: "simulation", detail: "SMTP_HOST configuré mais le paquet nodemailer n'est pas installé — e-mail simulé." };
      }
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: Number(process.env.SMTP_PORT ?? 587) === 465,
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      });
      await transporter.sendMail({
        from: process.env.SMTP_FROM ?? `AtelierManager <${process.env.SMTP_USER ?? smtpHost}>`,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        ...(opts.attachment ? { attachments: [{ filename: opts.attachment.filename, content: opts.attachment.base64, encoding: "base64" }] } : {}),
      });
      return { status: "envoye" };
    } catch (error) {
      return { status: "erreur", detail: String((error as Error)?.message ?? error).slice(0, 300) };
    }
  }

  console.log(`[email] SIMULATION → à : ${opts.to} — objet : ${opts.subject}`);
  return { status: "simulation", detail: "Aucun fournisseur d'e-mail configuré (RESEND_API_KEY ou SMTP_HOST) — envoi simulé, le PDF reste téléchargeable." };
}
