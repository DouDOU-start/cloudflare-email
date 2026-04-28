export function formatDate(unix: number | null | undefined): string {
  if (!unix) return "-";
  return new Date(unix * 1000).toLocaleString("zh-CN", { hour12: false });
}

export function formatRelative(unix: number | null | undefined): string {
  if (!unix) return "-";
  const diff = Math.max(0, Date.now() / 1000 - unix);
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)} 天前`;
  return new Date(unix * 1000).toLocaleDateString("zh-CN");
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
