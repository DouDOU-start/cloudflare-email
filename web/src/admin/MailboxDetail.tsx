import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, pagingQuery, type Mailbox, type MessageSummary, type Paged } from "@/lib/api";
import { BackLink, Button, ConfirmPanel, DataTable, EmptyState, Field, Input, Pagination, Panel, tableCellClass, tableHeadClass, tableHeaderCellClass, tableRowClass } from "@/components/ui";
import { formatBytes, formatDate } from "@/lib/format";
import { viewerURL } from "@/lib/viewer-url";
import { useState } from "react";

const DEFAULT_PAGE_SIZE = 20;

export default function MailboxDetail() {
  const { id } = useParams();
  const mailboxID = Number(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tokenName, setTokenName] = useState("");
  const [tokenURL, setTokenURL] = useState<string | null>(null);
  const [showTokenForm, setShowTokenForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const mailboxes = useQuery<Mailbox[]>({
    queryKey: ["mailboxes"],
    queryFn: () => api.get<Mailbox[]>("/api/admin/mailboxes"),
  });
  const mailbox = mailboxes.data?.find((m) => m.id === mailboxID);

  const messages = useQuery<Paged<MessageSummary>>({
    queryKey: ["mailbox-messages", mailboxID, page, pageSize],
    queryFn: () => api.get<Paged<MessageSummary>>(`/api/admin/mailboxes/${mailboxID}/messages?${pagingQuery(page, pageSize)}`),
  });

  const del = useMutation({
    mutationFn: () => api.del(`/api/admin/mailboxes/${mailboxID}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mailboxes"] });
      navigate("/admin");
    },
  });

  const createToken = useMutation({
    mutationFn: (name: string) => api.post<{ url: string }>("/api/admin/tokens", { mailbox_id: mailboxID, name }),
    onSuccess: (data) => {
      setTokenURL(viewerURL(data.url));
      setTokenName("");
      setShowTokenForm(false);
      qc.invalidateQueries({ queryKey: ["tokens"] });
    },
  });

  const refreshReadState = () => {
    qc.invalidateQueries({ queryKey: ["mailboxes"] });
    qc.invalidateQueries({ queryKey: ["messages"] });
    qc.invalidateQueries({ queryKey: ["mailbox-messages", mailboxID] });
  };

  const markMailboxRead = useMutation({
    mutationFn: () => api.post(`/api/admin/mailboxes/${mailboxID}/read`),
    onSuccess: refreshReadState,
  });

  const markMessageRead = useMutation({
    mutationFn: (messageID: number) => api.post(`/api/admin/messages/${messageID}/read`),
    onSuccess: refreshReadState,
  });

  if (!mailbox && !mailboxes.isLoading) {
    return <EmptyState title="未找到邮箱" />;
  }

  const inbox = messages.data?.items ?? [];
  const messageTotal = messages.data?.total ?? mailbox?.message_count ?? inbox.length;
  const pageCount = Math.max(1, Math.ceil(messageTotal / pageSize));
  const currentPage = Math.min(page, pageCount);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-5 shrink-0">
        <BackLink to="/admin">返回邮箱列表</BackLink>
      </div>

      <div className="mb-6 flex shrink-0 flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h1 className="truncate font-display text-[36px] font-black leading-none tracking-[-0.055em] text-foreground md:text-[48px]">
            {mailbox?.address ?? "邮箱"}
          </h1>
          <div className="mt-3 flex flex-wrap gap-3 font-mono-display text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            <span>邮件 <span className="num text-foreground">{messageTotal}</span></span>
            <span>未读 <span className={mailbox?.unread_count ? "num text-warning" : "num text-foreground"}>{mailbox?.unread_count ?? 0}</span></span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" disabled={!mailbox?.unread_count || markMailboxRead.isPending} onClick={() => markMailboxRead.mutate()}>
            {markMailboxRead.isPending ? "处理中..." : "全部已读"}
          </Button>
          <Button variant="secondary" onClick={() => setShowTokenForm((v) => !v)}>
            创建只读链接
          </Button>
          <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
            删除邮箱
          </Button>
        </div>
      </div>

      {showTokenForm && (
        <Panel className="mb-6 p-5" accent>
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <Field label="链接名称">
              <Input value={tokenName} onChange={(e) => setTokenName(e.target.value)} placeholder="例如：发给团队" />
            </Field>
            <Button disabled={createToken.isPending} onClick={() => createToken.mutate(tokenName)}>
              {createToken.isPending ? "创建中..." : "创建链接"}
            </Button>
          </div>
        </Panel>
      )}

      {tokenURL && (
        <Panel className="mb-6 border-warning/60 bg-warning-soft p-5 text-warning">
          <div className="mb-3 font-mono-display text-xs font-bold uppercase tracking-[0.14em] text-foreground">请立即复制此链接，关闭后不会再次显示。</div>
          <code className="block break-all border-2 border-border bg-surface-elevated p-3 font-mono-display text-xs text-foreground shadow-inset">{tokenURL}</code>
        </Panel>
      )}

      {messages.data && inbox.length === 0 ? (
        <EmptyState title="暂无邮件" />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <DataTable className="min-h-0 flex-1" maxHeight="100%" title="邮件列表" meta={<>共 <span className="num font-semibold">{messageTotal}</span> 封</>} minWidth={820}>
            <thead className={tableHeadClass}>
              <tr>
                <th className={tableHeaderCellClass}>发件人</th>
                <th className={tableHeaderCellClass}>主题</th>
                <th className={tableHeaderCellClass}>接收时间</th>
                <th className={tableHeaderCellClass}>大小</th>
                <th className="w-28 px-3 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {inbox.map((m) => (
                <tr key={m.id} className={tableRowClass}>
                  <td className={tableCellClass}>
                    <Link to={`/admin/messages/${m.id}`} className={m.is_read ? "font-mono-display text-muted-foreground hover:text-foreground" : "font-mono-display font-bold hover:text-accent"}>
                      {m.from_addr}
                    </Link>
                  </td>
                  <td className={tableCellClass}>
                    <Link to={`/admin/messages/${m.id}`} className="block max-w-lg truncate font-semibold hover:text-accent">
                      {m.subject || "(无主题)"}
                    </Link>
                  </td>
                  <td className={`${tableCellClass} font-mono-display text-xs text-muted-foreground`}>{formatDate(m.received_at)}</td>
                  <td className={`${tableCellClass} num font-mono-display text-xs text-muted-foreground`}>{formatBytes(m.size)}</td>
                  <td className={`${tableCellClass} text-right`}>
                    {!m.is_read && (
                      <Button type="button" size="sm" variant="ghost" disabled={markMessageRead.isPending} onClick={() => markMessageRead.mutate(m.id)}>
                        已读
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          <Pagination
            className="shrink-0"
            page={currentPage}
            pageSize={pageSize}
            total={messageTotal}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </div>
      )}

      {confirmDelete && (
        <ConfirmPanel title="确认删除邮箱？" confirmLabel="删除邮箱" danger busy={del.isPending} onCancel={() => setConfirmDelete(false)} onConfirm={() => del.mutate()}>
          将永久删除 {mailbox?.address} 以及其中保存的所有邮件。
        </ConfirmPanel>
      )}
    </div>
  );
}
