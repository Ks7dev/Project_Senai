import { EMAIL_TOKENS as t } from "@/emails/email-tokens"

/** Content of a transactional e-mail, before rendering. */
export type EmailContent = {
  /** Short summary shown by the inbox next to the subject. */
  preheader: string
  /** Main heading. */
  heading: string
  /** Paragraphs, in order. */
  paragraphs: string[]
  /** Label/value lines (order number, total, tracking code...). */
  details?: Array<{ label: string; value: string }>
  /** Main call to action. */
  action?: { label: string; url: string }
}

/**
 * Escapes text for HTML, so names and notes typed by users never
 * become markup in the e-mail.
 *
 * @param value - Raw text.
 * @returns Escaped text.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/**
 * Plain text version of the e-mail (also what clients without HTML
 * show).
 *
 * @param content - E-mail content.
 * @returns The text body.
 */
export function renderEmailText(content: EmailContent): string {
  return [
    content.heading,
    "",
    ...content.paragraphs.flatMap((paragraph) => [paragraph, ""]),
    ...(content.details?.length
      ? [...content.details.map((item) => `${item.label}: ${item.value}`), ""]
      : []),
    ...(content.action
      ? [`${content.action.label}: ${content.action.url}`, ""]
      : []),
    "Atelier Bureau",
  ].join("\n")
}

/**
 * Responsive HTML of a transactional e-mail with the brand identity
 * (RF53, RNF15): a single 600px column that shrinks to the screen on
 * phones, table layout and inline styles for e-mail clients, the
 * design system colors, `lang="pt-BR"` and a text alternative.
 *
 * @param content - E-mail content.
 * @returns The HTML document.
 */
export function renderEmailHtml(content: EmailContent): string {
  const paragraphs = content.paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;font:16px/1.6 ${t.sans};color:${t.ink};white-space:pre-line;">${escapeHtml(paragraph)}</p>`
    )
    .join("")
  const details = content.details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;background:${t.subtle};border-radius:8px;">${content.details
        .map(
          (item) =>
            `<tr><td style="padding:10px 16px;font:14px/1.5 ${t.sans};color:${t.inkMuted};">${escapeHtml(item.label)}</td><td style="padding:10px 16px;font:14px/1.5 ${t.sans};color:${t.ink};text-align:right;font-weight:600;">${escapeHtml(item.value)}</td></tr>`
        )
        .join("")}</table>`
    : ""
  const action = content.action
    ? `<p style="margin:8px 0 24px;"><a href="${escapeHtml(content.action.url)}" class="button" style="display:inline-block;padding:14px 28px;background:${t.primary};color:${t.onPrimary};font:600 16px/1 ${t.sans};text-decoration:none;border-radius:6px;">${escapeHtml(content.action.label)}</a></p>`
    : ""

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(content.heading)}</title>
<style>
@media (max-width: 620px) {
  .container { width: 100% !important; }
  .content { padding: 24px 16px !important; }
  .button { display: block !important; text-align: center !important; }
}
</style>
</head>
<body style="margin:0;padding:0;background:${t.canvas};">
<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(content.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${t.canvas};">
<tr><td align="center" style="padding:24px 8px;">
<table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:${t.elevated};border-radius:12px;">
<tr><td style="padding:24px 32px;border-bottom:1px solid ${t.subtle};font:600 14px/1 ${t.sans};letter-spacing:2px;text-transform:uppercase;color:${t.clay};">Atelier Bureau</td></tr>
<tr><td class="content" style="padding:32px;">
<h1 style="margin:0 0 16px;font:normal 28px/1.25 ${t.serif};color:${t.ink};">${escapeHtml(content.heading)}</h1>
${paragraphs}${details}${action}
</td></tr>
<tr><td style="padding:16px 32px 24px;font:12px/1.5 ${t.sans};color:${t.inkMuted};">Atelier Bureau · Papelaria nobre e mobiliário executivo. Este é um e-mail automático; para falar com a equipe, acesse Minha conta.</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

/**
 * Wraps a plain text message (password reset, invitation) in the
 * branded layout: the first line is the heading and blank lines split
 * the paragraphs.
 *
 * @param text - Plain text body.
 * @param subject - Subject, used as heading when the text is empty.
 * @returns The HTML document.
 */
export function textToEmailHtml(text: string, subject: string): string {
  const blocks = text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block && block !== "Atelier Bureau")
  return renderEmailHtml({
    preheader: subject,
    heading: subject,
    paragraphs: blocks.length > 0 ? blocks : [subject],
  })
}
