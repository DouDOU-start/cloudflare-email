const BASE = "";

export class APIError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const ct = res.headers.get("content-type") ?? "";
  const isJSON = ct.includes("application/json");
  const data = isJSON ? await res.json() : await res.text();
  if (!res.ok) {
    const msg = isJSON && data && typeof data === "object" && "error" in data ? (data as any).error : String(data || res.statusText);
    throw new APIError(res.status, msg);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
};

export function pagingQuery(page: number, pageSize: number, extras?: Record<string, string | undefined>) {
  const params = new URLSearchParams({
    limit: String(pageSize),
    offset: String((page - 1) * pageSize),
  });
  Object.entries(extras ?? {}).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params.toString();
}

// --- Types mirrored from the Go API ---

export interface Mailbox {
  id: number;
  address: string;
  note: string;
  auto_created: boolean;
  created_at: number;
  message_count: number;
  unread_count: number;
  last_received_at: number;
}

export interface MessageSummary {
  id: number;
  mailbox_id: number;
  message_id: string;
  from_addr: string;
  to_addr: string;
  subject: string;
  received_at: number;
  size: number;
  is_read: boolean;
}

export interface Attachment {
  id: number;
  filename: string;
  content_type: string;
  size: number;
}

export interface MessageDetail extends MessageSummary {
  text_body: string;
  html_body: string;
  has_raw: boolean;
  attachments: Attachment[];
}

export interface Token {
  id: number;
  mailbox_id: number;
  mailbox_address: string;
  name: string;
  created_at: number;
  expires_at: number | null;
  revoked_at: number | null;
  last_used_at: number | null;
  url?: string;
}

export interface SystemConfig {
  ingest_token: string;
  ingest_secret_set: boolean;
  session_secret_set: boolean;
  admin_username: string;
  admin_password_set: boolean;
  admin_api_key: string;
  editable: {
    ingest_token: boolean;
    ingest_secret: boolean;
    session_secret: boolean;
    admin_username: boolean;
    admin_password: boolean;
    admin_api_key: boolean;
  };
  retention_days: number;
  auto_cleanup: boolean;
}

export interface Paged<T> {
  items: T[];
  total: number;
}
