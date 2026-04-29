import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { APIError, api, type Mailbox, type Token } from "@/lib/api";
import {
  Badge,
  Button,
  ConfirmPanel,
  DataTable,
  EmptyState,
  Field,
  Input,
  Pagination,
  Panel,
  Select,
  tableCellClass,
  tableHeadClass,
  tableHeaderCellClass,
  tableRowClass,
} from "@/components/ui";
import { formatDate, formatRelative } from "@/lib/format";
import { useState } from "react";

const DEFAULT_PAGE_SIZE = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type TokenStatus = "active" | "revoked" | "expired";
type LinkResult = { title: string; message: string; url?: string; tone?: "default" | "danger" };

export default function Tokens() {
  const qc = useQueryClient();
  const tokens = useQuery<Token[]>({
    queryKey: ["tokens"],
    queryFn: () => api.get<Token[]>("/api/admin/tokens"),
  });
  const mailboxes = useQuery<Mailbox[]>({
    queryKey: ["mailboxes"],
    queryFn: () => api.get<Mailbox[]>("/api/admin/mailboxes"),
  });

  const [mailboxAddress, setMailboxAddress] = useState("");
  const [name, setName] = useState("");
  const [ttl, setTTL] = useState("30");
  const [linkResult, setLinkResult] = useState<LinkResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [pendingReset, setPendingReset] = useState<Token | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const normalizedMailboxAddress = mailboxAddress.trim().toLowerCase();
  const hasMailboxAddress = normalizedMailboxAddress.length > 0;
  const mailboxAddressError = hasMailboxAddress && !EMAIL_RE.test(normalizedMailboxAddress) ? "请输入完整邮箱地址，例如 user@example.com" : "";
  const existingMailbox = mailboxes.data?.find((m) => m.address.toLowerCase() === normalizedMailboxAddress);
  const ttlDays = ttl === "" ? 0 : Number(ttl);

  const create = useMutation({
    mutationFn: async () => {
      let mailbox = existingMailbox;
      let createdMailbox = false;

      if (!mailbox) {
        try {
          mailbox = await api.post<Mailbox>("/api/admin/mailboxes", { address: normalizedMailboxAddress });
          createdMailbox = true;
        } catch (err) {
          if (!(err instanceof APIError) || err.status !== 409) throw err;

          const refreshedMailboxes = await qc.fetchQuery({
            queryKey: ["mailboxes"],
            queryFn: () => api.get<Mailbox[]>("/api/admin/mailboxes"),
          });
          mailbox = refreshedMailboxes.find((m) => m.address.toLowerCase() === normalizedMailboxAddress);
          if (!mailbox) throw err;
        }
      }

      const token = await api.post<Token>("/api/admin/tokens", {
        mailbox_id: mailbox.id,
        name,
        ttl_days: ttlDays,
      });

      return { token, createdMailbox };
    },
    onSuccess: ({ token, createdMailbox }) => {
      setLinkResult({ title: "新链接", message: createdMailbox ? "已同步创建新邮箱。" : "", url: token.url });
      setCopied(false);
      setName("");
      setMailboxAddress("");
      qc.invalidateQueries({ queryKey: ["tokens"] });
      qc.invalidateQueries({ queryKey: ["mailboxes"] });
    },
  });

  const view = useMutation({
    mutationFn: (id: number) => api.get<Token>(`/api/admin/tokens/${id}`),
    onSuccess: (data) => {
      setCopied(false);
      if (data.url) {
        setLinkResult({ title: "当前链接", message: "", url: data.url });
        return;
      }
      setLinkResult({ title: "链接不可查看", message: "请重置后查看新链接。", tone: "danger" });
    },
  });

  const reset = useMutation({
    mutationFn: (id: number) => api.post<Token>(`/api/admin/tokens/${id}/reset`),
    onSuccess: (data) => {
      setPendingReset(null);
      setCopied(false);
      setLinkResult({ title: "新链接", message: "旧链接已失效", url: data.url });
      qc.invalidateQueries({ queryKey: ["tokens"] });
    },
  });

  const revoke = useMutation({
    mutationFn: (id: number) => api.post(`/api/admin/tokens/${id}/revoke`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tokens"] }),
  });
  const del = useMutation({
    mutationFn: (id: number) => api.del(`/api/admin/tokens/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tokens"] }),
  });

  const tokenItems = tokens.data ?? [];
  const activeCount = tokenItems.filter((t) => tokenStatus(t) === "active").length;
  const revokedCount = tokenItems.filter((t) => tokenStatus(t) === "revoked").length;
  const expiredCount = tokenItems.filter((t) => tokenStatus(t) === "expired").length;
  const searchText = query.trim().toLowerCase();
  const filteredTokens = tokenItems.filter((t) => {
    const status = tokenStatus(t);
    const matchesStatus = statusFilter === "all" || statusFilter === status;
    const matchesSearch = !searchText || `${t.mailbox_address} ${t.name}`.toLowerCase().includes(searchText);

    return matchesStatus && matchesSearch;
  });
  const pageCount = Math.max(1, Math.ceil(filteredTokens.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageItems = filteredTokens.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const copyLink = async () => {
    if (!linkResult?.url) return;
    await navigator.clipboard.writeText(linkResult.url);
    setCopied(true);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-4 grid shrink-0 gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Panel className="p-4" accent>
          <div className="grid gap-3 md:grid-cols-[minmax(180px,1.35fr)_minmax(160px,1fr)_120px_auto] md:items-end">
            <Field label="邮箱" className="space-y-1.5">
              <Input
                list="token-mailboxes"
                placeholder="选择或输入新邮箱"
                value={mailboxAddress}
                onChange={(e) => setMailboxAddress(e.target.value)}
                aria-invalid={mailboxAddressError ? true : undefined}
                className={mailboxAddressError ? "border-danger focus:border-danger" : undefined}
              />
              {mailboxAddressError ? <div className="text-xs font-semibold text-danger">{mailboxAddressError}</div> : null}
              <datalist id="token-mailboxes">
                {mailboxes.data?.map((m) => <option key={m.id} value={m.address} />)}
              </datalist>
            </Field>
            <Field label="名称" className="space-y-1.5">
              <Input placeholder="例如：发给 Bob" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="天数" className="space-y-1.5">
              <Input
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="0 为永久"
                value={ttl}
                onChange={(e) => setTTL(e.target.value.replace(/\D/g, ""))}
              />
            </Field>
            <Button className="h-11 px-5" disabled={!hasMailboxAddress || !!mailboxAddressError || create.isPending} onClick={() => create.mutate()} variant="stamp">
              {create.isPending ? "创建中..." : "创建"}
            </Button>
          </div>
        </Panel>

        <Panel className="p-4">
          <div className="font-mono-display text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">链接状态</div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <StatusMetric label="有效" value={activeCount} tone="text-success" />
            <StatusMetric label="过期" value={expiredCount} tone="text-warning" />
            <StatusMetric label="撤销" value={revokedCount} tone="text-danger" />
          </div>
        </Panel>
      </div>

      <Panel className="mb-4 shrink-0 px-4 py-3">
        <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_160px] md:items-end">
          <Field label="搜索链接" className="space-y-1.5">
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="搜索邮箱或链接名称"
            />
          </Field>
          <Field label="状态" className="space-y-1.5">
            <Select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">全部状态</option>
              <option value="active">有效</option>
              <option value="expired">已过期</option>
              <option value="revoked">已撤销</option>
            </Select>
          </Field>
        </div>
      </Panel>

      {tokens.isLoading && <Panel className="px-6 py-12 text-center font-mono-display text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">正在加载访问链接...</Panel>}
      {tokens.data && tokens.data.length === 0 && <EmptyState title="暂无访问链接" hint="创建链接后，可在不开放管理员权限的情况下共享邮箱。" />}
      {tokens.data && tokens.data.length > 0 && (
        <div className="flex min-h-0 flex-1 flex-col">
          {filteredTokens.length === 0 ? (
            <EmptyState title="没有匹配的访问链接" hint="调整搜索关键词或状态筛选后再试。" />
          ) : (
            <>
              <DataTable className="min-h-0 flex-1" maxHeight="100%" title="访问链接列表" meta={<>共 <span className="num font-semibold">{filteredTokens.length}</span> 条</>} minWidth={1080}>
                <thead className={tableHeadClass}>
                  <tr>
                    <th className={tableHeaderCellClass}>链接</th>
                    <th className={tableHeaderCellClass}>有效期</th>
                    <th className={tableHeaderCellClass}>最近使用</th>
                    <th className={tableHeaderCellClass}>状态</th>
                    <th className={`${tableHeaderCellClass} text-right`}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((t) => (
                    <tr key={t.id} className={tableRowClass}>
                      <td className={tableCellClass}>
                        <div className="font-mono-display text-[13px] font-bold text-foreground">{t.mailbox_address}</div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>{t.name || "未命名链接"}</span>
                          <span className="font-mono-display">创建于 {formatDate(t.created_at)}</span>
                        </div>
                      </td>
                      <td className={`${tableCellClass} font-mono-display text-xs text-muted-foreground`}>{t.expires_at ? formatDate(t.expires_at) : "永不过期"}</td>
                      <td className={`${tableCellClass} text-muted-foreground`}>{formatRelative(t.last_used_at)}</td>
                      <td className={tableCellClass}>{statusBadge(t)}</td>
                      <td className={`${tableCellClass} text-right`}>
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button size="sm" variant="secondary" onClick={() => view.mutate(t.id)} disabled={view.isPending}>
                            查看
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => setPendingReset(t)} disabled={reset.isPending}>
                            重置
                          </Button>
                          {!t.revoked_at && (
                            <Button size="sm" variant="ghost" onClick={() => revoke.mutate(t.id)} disabled={revoke.isPending}>
                              撤销
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => del.mutate(t.id)} disabled={del.isPending}>
                            删除
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
              <Pagination
                className="shrink-0"
                page={currentPage}
                pageSize={pageSize}
                total={filteredTokens.length}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
              />
            </>
          )}
        </div>
      )}

      {linkResult && (
        <LinkDialog
          result={linkResult}
          copied={copied}
          onCopy={copyLink}
          onClose={() => {
            setLinkResult(null);
            setCopied(false);
          }}
        />
      )}

      {pendingReset && (
        <ConfirmPanel
          title="重置访问链接"
          confirmLabel="重置"
          cancelLabel="取消"
          busy={reset.isPending}
          onConfirm={() => reset.mutate(pendingReset.id)}
          onCancel={() => setPendingReset(null)}
        >
          旧链接会立即失效。邮箱：{pendingReset.mailbox_address}
        </ConfirmPanel>
      )}
    </div>
  );
}

function LinkDialog({
  result,
  copied,
  onCopy,
  onClose,
}: {
  result: LinkResult;
  copied: boolean;
  onCopy: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/45 px-4 backdrop-blur-sm">
      <Panel className="w-full max-w-2xl p-5 animate-enter" accent>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="font-mono-display text-[11px] font-bold uppercase tracking-[0.16em] text-accent">access link</div>
            <div className="mt-2 font-display text-3xl font-black tracking-[-0.05em]">{result.title}</div>
          </div>
          <Button type="button" variant="ghost" onClick={onClose}>
            关闭
          </Button>
        </div>
        {result.url ? (
          <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <code className="block break-all border-2 border-border bg-surface-elevated p-3 font-mono-display text-xs text-foreground shadow-inset">{result.url}</code>
            <Button type="button" variant="secondary" onClick={onCopy}>
              {copied ? "已复制" : "复制链接"}
            </Button>
          </div>
        ) : (
          <div className="mt-5 border-2 border-danger/40 bg-danger-soft p-3 text-[14px] text-danger shadow-inset">{result.message}</div>
        )}
        {result.url && result.message && <div className="mt-3 text-xs leading-5 text-muted-foreground">{result.message}</div>}
      </Panel>
    </div>
  );
}

function StatusMetric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="border-2 border-border bg-surface-muted px-3 py-2 shadow-inset">
      <div className="font-mono-display text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className={`num mt-1 font-display text-3xl font-black leading-none tracking-[-0.06em] ${tone}`}>{value}</div>
    </div>
  );
}

function tokenStatus(t: Token): TokenStatus {
  if (t.revoked_at) return "revoked";
  if (t.expires_at && t.expires_at * 1000 < Date.now()) return "expired";
  return "active";
}

function statusBadge(t: Token) {
  const status = tokenStatus(t);
  if (status === "revoked") return <Badge tone="danger">已撤销</Badge>;
  if (status === "expired") return <Badge tone="warn">已过期</Badge>;
  return <Badge tone="success">有效</Badge>;
}
