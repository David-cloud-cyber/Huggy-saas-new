import type { CommandRequest, FilePatch, OrgRole, RequestContext, SecurityReport } from './types';

export class PlatformError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
    public readonly metadata: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'PlatformError';
  }
}

export const roleRank: Record<OrgRole, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
  owner: 4,
};

export function requireRole(context: RequestContext, roles: OrgRole[]): void {
  if (!roles.includes(context.role)) {
    throw new PlatformError('forbidden', 'You do not have permission to perform this action.', 403, {
      required: roles,
      actual: context.role,
    });
  }
}

export function canRead(role: OrgRole): boolean {
  return roleRank[role] >= roleRank.viewer;
}

export function canEdit(role: OrgRole): boolean {
  return roleRank[role] >= roleRank.editor;
}

export function canAdmin(role: OrgRole): boolean {
  return roleRank[role] >= roleRank.admin;
}

export function canOwn(role: OrgRole): boolean {
  return role === 'owner';
}

const dangerousPathSegments = ['..', '~'];
const blockedPathPrefixes = ['/', '\\'];
const blockedPathSubstrings = ['node_modules/', '.git/', '.env', 'id_rsa', 'id_dsa', 'authorized_keys'];

export function normalizeProjectPath(input: string): string {
  const path = input.replaceAll('\\', '/').trim();
  if (!path) {
    throw new PlatformError('invalid_path', 'File path is required.');
  }
  if (blockedPathPrefixes.some((prefix) => path.startsWith(prefix))) {
    throw new PlatformError('invalid_path', 'Absolute paths are not allowed.', 400, { path });
  }
  if (path.split('/').some((segment) => dangerousPathSegments.includes(segment))) {
    throw new PlatformError('invalid_path', 'Path traversal is not allowed.', 400, { path });
  }
  if (blockedPathSubstrings.some((part) => path.includes(part))) {
    throw new PlatformError('blocked_path', 'This path is blocked by the project security policy.', 400, { path });
  }
  return path;
}

export function validateFilePatch(patch: FilePatch): FilePatch {
  return {
    ...patch,
    operations: patch.operations.map((operation) => ({
      ...operation,
      path: normalizeProjectPath(operation.path),
    })),
  };
}

const allowedCommands: Record<CommandRequest['command'], string[]> = {
  npm_install: ['npm', 'install'],
  npm_build: ['npm', 'run', 'build'],
  npm_test: ['npm', 'run', 'test'],
  npm_lint: ['npm', 'run', 'lint'],
  typecheck: ['npm', 'run', 'typecheck'],
};

const forbiddenCommandFragments = [
  'rm -rf /',
  'curl ',
  'wget ',
  'nc ',
  'netcat',
  'bash -i',
  'powershell -enc',
  'Invoke-WebRequest',
  '/etc/passwd',
  '.ssh',
  'crypto',
  'miner',
];

export function resolveAllowedCommand(request: CommandRequest): string[] {
  const base = allowedCommands[request.command];
  if (!base) {
    throw new PlatformError('command_not_allowed', 'The requested command is not allowlisted.', 400, { command: request.command });
  }
  const raw = [...base, ...request.args].join(' ');
  if (forbiddenCommandFragments.some((fragment) => raw.includes(fragment))) {
    throw new PlatformError('command_blocked', 'The requested command contains blocked fragments.', 400, { command: raw });
  }
  return [...base, ...request.args];
}

const secretPatterns = [
  /sk-[a-zA-Z0-9_-]{20,}/g,
  /ghp_[a-zA-Z0-9]{20,}/g,
  /xox[baprs]-[a-zA-Z0-9-]{20,}/g,
  /vercel_[a-zA-Z0-9_-]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
];

export function redactSecrets(value: string): string {
  return secretPatterns.reduce((text, pattern) => text.replace(pattern, '[REDACTED]'), value);
}

export function scanGeneratedText(path: string, content: string): SecurityReport['findings'] {
  const findings: SecurityReport['findings'] = [];
  if (secretPatterns.some((pattern) => pattern.test(content))) {
    findings.push({ category: 'secret', severity: 'critical', message: 'Potential hardcoded secret detected.', file: path });
  }
  if (/window\.location\s*=|document\.location\s*=|eval\(|new Function\(/.test(content)) {
    findings.push({ category: 'xss', severity: 'high', message: 'Potential unsafe browser execution pattern detected.', file: path });
  }
  if (/fetch\(['"]https?:\/\/169\.254\.169\.254/.test(content)) {
    findings.push({ category: 'ssrf', severity: 'critical', message: 'Metadata service access attempt detected.', file: path });
  }
  if (/login|password|seed phrase|wallet|bank/i.test(content) && /verify|urgent|suspended|recover/i.test(content)) {
    findings.push({ category: 'abuse', severity: 'high', message: 'Potential phishing-like content detected.', file: path });
  }
  return findings;
}

export function createSecurityReport(files: { path: string; content?: string }[]): SecurityReport {
  const findings = files.flatMap((file) => scanGeneratedText(file.path, file.content ?? ''));
  const blocked = findings.some((finding) => finding.severity === 'critical');
  const high = findings.some((finding) => finding.severity === 'high');
  return {
    type: 'security_report',
    riskLevel: blocked ? 'blocked' : high ? 'high' : findings.length > 0 ? 'medium' : 'low',
    findings,
    publishAllowed: !blocked && !high,
  };
}
