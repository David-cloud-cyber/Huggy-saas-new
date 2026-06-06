import type { AgentGeneratedFile, AgentVerificationCheck } from './agent-v2.ts';
import { containsSecret, redactSecrets } from './secret-redaction.ts';

export type SecurityFinding = {
  key: string;
  status: 'pass' | 'warn' | 'fail';
  severity: 'info' | 'low' | 'medium' | 'high';
  message: string;
  file?: string;
  public_payload?: Record<string, unknown>;
};

export type SecurityScanResult = {
  status: 'passed' | 'warning' | 'failed';
  findings: SecurityFinding[];
  checks: AgentVerificationCheck[];
};

function normalizePath(value: string) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\/+/, '');
}

function sourceBundle(files: AgentGeneratedFile[]) {
  return files.map(file => `--- ${normalizePath(file.path)} ---\n${file.content || ''}`).join('\n\n');
}

function fileByPath(files: AgentGeneratedFile[], target: string) {
  const normalized = normalizePath(target).toLowerCase();
  return files.find(file => normalizePath(file.path).toLowerCase() === normalized);
}

export function scanGeneratedSecurity(files: AgentGeneratedFile[]): SecurityScanResult {
  const findings: SecurityFinding[] = [];
  const source = sourceBundle(files);
  const schema = fileByPath(files, 'supabase/schema.sql')?.content || '';
  const paths = files.map(file => normalizePath(file.path));

  if (containsSecret(source) || /service[_-]?role|SUPABASE_SERVICE_ROLE|sbp_[a-z0-9]|secret\s+eyJ/i.test(source)) {
    findings.push(fail('security_no_frontend_secrets', 'Potential secret, service role key, or provider credential found in generated files.'));
  } else {
    findings.push(pass('security_no_frontend_secrets', 'No frontend secrets or service role keys detected.'));
  }

  const usesSupabase = /@supabase\/supabase-js|createClient\(|\bsupabase\s*\.|Huggy Cloud|getHuggyCloudClient/i.test(source);
  const usesPrivateData = /\b(auth|login|signup|database|crud|orders?|products?|customers?|clients?|bookings?|reservations?|payments?|invoices?|contacts?|deals?|tasks?|notes?|storage|upload|seller|buyer)\b/i.test(source);
  const createTables = Array.from(schema.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-zA-Z0-9_]+)/gi)).map(match => match[1]);

  if (usesPrivateData || usesSupabase || createTables.length) {
    findings.push(schema.trim()
      ? pass('security_schema_present', 'Supabase schema contract is present.', 'supabase/schema.sql')
      : fail('security_schema_present', 'Apps with private data need a Supabase schema contract.', 'supabase/schema.sql'));

    findings.push(/enable\s+row\s+level\s+security/i.test(schema)
      ? pass('security_rls_enabled', 'RLS is enabled in the generated schema.', 'supabase/schema.sql')
      : fail('security_rls_enabled', 'Every user table needs RLS enabled.', 'supabase/schema.sql'));

    findings.push(/create\s+policy/i.test(schema)
      ? pass('security_rls_policies', 'RLS policies are present.', 'supabase/schema.sql')
      : fail('security_rls_policies', 'Generated schema needs explicit RLS policies.', 'supabase/schema.sql'));

    findings.push(/owner_id|organization_id|org_id/i.test(schema)
      ? pass('security_owner_scope', 'Owner or organization scoping is present.', 'supabase/schema.sql')
      : fail('security_owner_scope', 'Private tables need owner_id or organization_id scoping.', 'supabase/schema.sql'));
  }

  const hasValidation = paths.includes('src/lib/validation.ts') || /\bzod\b|z\.object\(|safe[A-Z]\w+Schema/i.test(source);
  if (usesPrivateData) {
    findings.push(hasValidation
      ? pass('security_server_validation', 'Validation layer is present.')
      : fail('security_server_validation', 'Sensitive data workflows need validation before writes.'));
  }

  const hasStripe = /\b(stripe|checkout|subscription|payment|invoice)\b/i.test(source);
  if (hasStripe) {
    findings.push(/stripe-signature|webhook signature|assertWebhookSignature/i.test(source)
      ? pass('security_webhook_signature', 'Payment webhook signature verification is represented.')
      : fail('security_webhook_signature', 'Payment apps need server-side webhook signature verification.'));
  }

  if (/\b(upload|storage|bucket|file input|type=["']file["'])\b/i.test(source)) {
    findings.push(/mime_type|size_bytes|uploadPolicySchema|storage policy|bucket policy/i.test(source)
      ? pass('security_upload_policy', 'Upload constraints or storage policy contract is present.')
      : warn('security_upload_policy', 'Uploads should include mime type, size, path and storage access constraints.'));
  }

  if (/\b(delete|remove|reset|clear|destroy|supprimer|effacer)\b/i.test(source)) {
    findings.push(/\b(confirm\(|confirmation|undo|toast|modal|dialog|cancel|rollback|feedback)\b/i.test(source)
      ? pass('security_destructive_feedback', 'Destructive actions include confirmation, undo or visible feedback.')
      : warn('security_destructive_feedback', 'Destructive actions need confirmation, undo or clear feedback.'));
  }

  const status = findings.some(item => item.status === 'fail')
    ? 'failed'
    : findings.some(item => item.status === 'warn')
      ? 'warning'
      : 'passed';

  return {
    status,
    findings: findings.map(item => ({ ...item, message: redactSecrets(item.message, '[redacted]') })),
    checks: findings.map(item => ({
      key: item.key,
      status: item.status,
      severity: item.severity,
      message: redactSecrets(item.message, '[redacted]'),
      file: item.file,
    })),
  };
}

function pass(key: string, message: string, file?: string, public_payload?: Record<string, unknown>): SecurityFinding {
  return { key, status: 'pass', severity: 'info', message, file, public_payload };
}

function warn(key: string, message: string, file?: string, public_payload?: Record<string, unknown>): SecurityFinding {
  return { key, status: 'warn', severity: 'medium', message, file, public_payload };
}

function fail(key: string, message: string, file?: string, public_payload?: Record<string, unknown>): SecurityFinding {
  return { key, status: 'fail', severity: 'high', message, file, public_payload };
}
