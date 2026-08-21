/**
 * Runtime failure document used when the generated application cannot be
 * executed. It is deliberately non-interactive and never represents a
 * generated application. The name is retained temporarily for import
 * compatibility while callers migrate to the strict preview status.
 */
function escapeHtml(value: unknown) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildPreviewErrorHtml(input: { projectName?: string; error?: string }) {
  const projectName = escapeHtml(input.projectName || 'Preview');
  const error = escapeHtml(input.error || 'The generated runtime could not be verified.');
  return [
    '<main data-huggy-preview-error="true" class="huggy-preview-error" aria-labelledby="huggy-preview-error-title">',
    '  <section class="huggy-preview-error-panel">',
    '    <p class="huggy-preview-error-kicker">Huggy · Runtime</p>',
    '    <h1 id="huggy-preview-error-title">Preview indisponible</h1>',
    `    <p class="huggy-preview-error-project">${projectName}</p>`,
    '    <p>Le runtime réel n’a pas pu être vérifié. Cette page n’est pas l’application générée et ne peut pas être publiée.</p>',
    `    <pre role="alert">${error}</pre>`,
    '  </section>',
    '</main>',
  ].join('\n');
}
