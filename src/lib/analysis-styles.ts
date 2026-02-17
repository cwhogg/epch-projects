export function getBadgeClass(rec: string) {
  switch (rec) {
    case 'Tier 1': return 'badge-success';
    case 'Tier 2': return 'badge-warning';
    case 'Tier 3': return 'badge-danger';
    default: return 'badge-neutral';
  }
}

export function getConfidenceStyle(conf: string) {
  switch (conf) {
    case 'High': return { color: 'var(--accent-emerald)' };
    case 'Medium': return { color: 'var(--accent-amber)' };
    case 'Low': return { color: 'var(--color-danger)' };
    default: return { color: 'var(--text-muted)' };
  }
}

export function getWebsiteStatusStyle(status: string) {
  switch (status) {
    case 'live': return { background: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent-emerald)' };
    case 'deploying':
    case 'pushing':
    case 'generating': return { background: 'rgba(245, 158, 11, 0.15)', color: 'var(--accent-amber)' };
    case 'failed': return { background: 'rgba(248, 113, 113, 0.15)', color: 'var(--color-danger)' };
    default: return { background: 'rgba(113, 113, 122, 0.1)', color: 'var(--text-muted)' };
  }
}

export function getWebsiteStatusLabel(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}
