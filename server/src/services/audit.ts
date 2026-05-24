import { UserContext } from './store';

type AuditLogEntry = {
  id: string;
  organization_id: string;
  user_id: string;
  action: string;
  target_type?: string;
  target_id?: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

const auditLogs: AuditLogEntry[] = [];

export class AuditLogService {
  log(user: UserContext, action: string, metadata: Record<string, unknown> = {}, target?: { type?: string; id?: string }) {
    const entry: AuditLogEntry = {
      id: crypto.randomUUID(),
      organization_id: user.id,
      user_id: user.id,
      action,
      target_type: target?.type,
      target_id: target?.id,
      metadata,
      created_at: new Date().toISOString()
    };
    auditLogs.unshift(entry);
    return entry;
  }

  list(user: UserContext) {
    return auditLogs.filter((entry) => entry.organization_id === user.id);
  }
}
