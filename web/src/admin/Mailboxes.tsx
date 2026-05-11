import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api, pagingQuery, type Mailbox, type MessageSummary, type Paged } from "@/lib/api";
import { Button, DataTable, Dot, EmptyState, Field, Input, Metric, Pagination, Panel, Select, tableCellClass, tableHeadClass, tableHeaderCellClass, tableRowClass, Toolbar } from "@/components/ui";
import { formatDate } from "@/lib/format";

const DEFAULT_PAGE_SIZE = 10;

type ViewMode = "messages" | "mailboxes";

const Icon = {
  mailbox: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  ),
  letter: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="1" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  ),
  unread: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7" />
    </svg>
  ),
  arrow: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
      <path d="M12 5l7 7-7 7" />
    </svg>
  ),
};

export default function Mailboxes() {
  const [viewMode, setViewMode] = useState<ViewMode>("messages");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [query, setQuery] = useState("");
  const [readFilter, setReadFilter] = useState("all");
  const qc = useQueryClient();

  const mailboxesQuery = useQuery<Mailbox[]>({
    queryKey: ["mailboxes"],
    queryFn: () => api.get<Mailbox[]>("/api/admin/mailboxes"),
  });

  const searchText = query.trim().toLowerCase();
  const messageParams = pagingQuery(page, pageSize, {
    status: readFilter,
    q: searchText,
  });

  const messagesQuery = useQuery<Paged<MessageSummary>>({
    queryKey: ["messages", page, pageSize, searchText, readFilter],
    queryFn: () => api.get<Paged<MessageSummary>>(`/api/admin/messages?${messageParams}`),
  });

  const refreshReadState = () => {
    qc.invalidateQueries({ queryKey: ["mailboxes"] });
    qc.invalidateQueries({ queryKey: ["messages"] });
  };

  const markAllRead = useMutation({
    mutationFn: () => api.post("/api/admin/messages/read"),
    onSuccess: refreshReadState,
  });

  const markMessageRead = useMutation({
    mutationFn: (messageID: number) => api.post(`/api/admin/messages/${messageID}/read`),
    onSuccess: refreshReadState,
  });

  const mailboxes = mailboxesQuery.data ?? [];
  const messages = messagesQuery.data?.items ?? [];
  const totalMessages = mailboxes.reduce((a, b) => a + b.message_count, 0);
  const unreadMessages = mailboxes.reduce((a, b) => a + b.unread_count, 0);
  const mailboxByID = new Map(mailboxes.map((m) => [m.id, m]));

  const filteredMailboxes = mailboxes.filter((m) => {
    const matchesSearch = !searchText || m.address.toLowerCase().includes(searchText) || (m.note ?? "").toLowerCase().includes(searchText);
    const matchesRead = readFilter === "all" || (readFilter === "unread" ? m.unread_count > 0 : m.unread_count === 0);

    return matchesSearch && matchesRead;
  });
  const sortedMailboxes = [...filteredMailboxes].sort((a, b) => {
    if (b.unread_count !== a.unread_count) return b.unread_count - a.unread_count;
    return b.last_received_at - a.last_received_at;
  });

  const isMessageView = viewMode === "messages";
  const mailboxPageCount = Math.max(1, Math.ceil(sortedMailboxes.length / pageSize));
  const messageTotal = messagesQuery.data?.total ?? totalMessages;
  const messagePageCount = Math.max(1, Math.ceil(messageTotal / pageSize));
  const currentPage = Math.min(page, isMessageView ? messagePageCount : mailboxPageCount);
  const mailboxPageItems = sortedMailboxes.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const activeTotal = isMessageView ? messageTotal : sortedMailboxes.length;

  const setMode = (mode: ViewMode) => {
    setViewMode(mode);
    setQuery("");
    setReadFilter("all");
    setPage(1);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-5 grid shrink-0 gap-4 md:grid-cols-3">
        <Metric label="邮箱数量" value={mailboxes.length} icon={Icon.mailbox} tone="accent" delay={0} />
        <Metric label="邮件总数" value={totalMessages.toLocaleString("en-US")} icon={Icon.letter} delay={70} />
        <Metric label="未读" value={unreadMessages} icon={Icon.unread} tone={unreadMessages > 0 ? "warn" : "success"} delay={140} />
      </div>

      {(mailboxesQuery.isLoading || (isMessageView && messagesQuery.isLoading)) && <Panel className="px-6 py-12 text-center font-mono-display text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">正在加载邮件...</Panel>}

      {mailboxesQuery.data && mailboxesQuery.data.length === 0 && <EmptyState title="暂无邮箱" hint="向 Cloudflare 路由域名下的地址发送邮件后，系统会识别并记录邮箱。" />}

      {mailboxesQuery.data && mailboxesQuery.data.length > 0 && (!isMessageView || messagesQuery.data) && (
        <div className="flex min-h-0 flex-1 flex-col">
          <Toolbar className="shrink-0" contentClassName="md:grid md:grid-cols-3 md:items-end md:gap-4">
            <div className="flex flex-wrap gap-2 md:self-end">
              <Button type="button" variant={isMessageView ? "primary" : "secondary"} onClick={() => setMode("messages")}>
                全部邮件
              </Button>
              <Button type="button" variant={!isMessageView ? "primary" : "secondary"} onClick={() => setMode("mailboxes")}>
                邮箱分组
              </Button>
              <Button type="button" variant="secondary" disabled={unreadMessages === 0 || markAllRead.isPending} onClick={() => markAllRead.mutate()}>
                {markAllRead.isPending ? "处理中..." : "全部已读"}
              </Button>
            </div>
            <div className="grid gap-3 md:col-span-2 md:grid-cols-[minmax(220px,1fr)_160px]">
              <Field label="模糊搜索" className="space-y-1.5">
                <Input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(1);
                  }}
                  placeholder={isMessageView ? "搜索发件人、收件邮箱或主题" : "搜索邮箱地址或备注"}
                />
              </Field>
              <Field label="状态" className="space-y-1.5">
                <Select
                  value={readFilter}
                  onChange={(e) => {
                    setReadFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="all">全部状态</option>
                  <option value="unread">{isMessageView ? "未读" : "有未读"}</option>
                  <option value="read">{isMessageView ? "已读" : "无未读"}</option>
                </Select>
              </Field>
            </div>
          </Toolbar>

          {activeTotal === 0 ? (
            <EmptyState title={isMessageView ? "没有匹配的邮件" : "没有匹配的邮箱"} hint="调整搜索关键词或过滤条件后再试。" />
          ) : isMessageView ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <DataTable className="min-h-0 flex-1" maxHeight="100%" title="邮件列表" meta={<>共 <span className="num font-semibold">{activeTotal}</span> 封</>} minWidth={980}>
                <thead className={tableHeadClass}>
                  <tr>
                    <th className={tableHeaderCellClass}>主题</th>
                    <th className={tableHeaderCellClass}>发件人</th>
                    <th className={tableHeaderCellClass}>收件邮箱</th>
                    <th className={tableHeaderCellClass}>接收时间</th>
                    <th className="w-28 px-3 py-3 text-right">操作</th>
                    <th className="w-10 px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {messages.map((m) => {
                    const mailbox = mailboxByID.get(m.mailbox_id);

                    return (
                      <tr key={m.id} className={tableRowClass}>
                        <td className={tableCellClass}>
                          <Link to={`/admin/messages/${m.id}`} className="block max-w-md">
                            <div className="flex items-center gap-2.5">
                              <Dot tone={m.is_read ? "default" : "warn"} />
                              <span className={m.is_read ? "truncate font-semibold text-muted-foreground transition-colors group-hover:text-foreground" : "truncate font-bold text-foreground transition-colors group-hover:text-accent"}>{m.subject || "(无主题)"}</span>
                            </div>
                          </Link>
                        </td>
                        <td className={`${tableCellClass} max-w-[260px] truncate font-mono-display text-[13px] text-muted-foreground`}>{m.from_addr}</td>
                        <td className={tableCellClass}>
                          <Link to={`/admin/mailboxes/${m.mailbox_id}`} className="font-mono-display text-[13px] font-bold text-foreground hover:text-accent">
                            {mailbox?.address ?? m.to_addr}
                          </Link>
                        </td>
                        <td className={`${tableCellClass} whitespace-nowrap font-mono-display text-xs text-muted-foreground`}>{formatDate(m.received_at)}</td>
                        <td className={`${tableCellClass} text-right`}>
                          {!m.is_read && (
                            <Button type="button" size="sm" variant="ghost" disabled={markMessageRead.isPending} onClick={() => markMessageRead.mutate(m.id)}>
                              已读
                            </Button>
                          )}
                        </td>
                        <td className="w-10 px-3 py-3 text-right text-muted-foreground transition-colors group-hover:text-accent">
                          <Link to={`/admin/messages/${m.id}`} aria-label="打开邮件">
                            {Icon.arrow}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
              <Pagination
                className="shrink-0"
                page={currentPage}
                pageSize={pageSize}
                total={activeTotal}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
              />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <DataTable className="min-h-0 flex-1" maxHeight="100%" title="地址列表" meta={<>共 <span className="num font-semibold">{sortedMailboxes.length}</span> 个</>}>
                <thead className={tableHeadClass}>
                  <tr>
                    <th className={tableHeaderCellClass}>地址</th>
                    <th className={`${tableHeaderCellClass} text-right`}>邮件</th>
                    <th className={`${tableHeaderCellClass} text-right`}>未读</th>
                    <th className={tableHeaderCellClass}>最近接收</th>
                    <th className="w-10 px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {mailboxPageItems.map((m) => (
                    <tr key={m.id} className={tableRowClass}>
                      <td className={tableCellClass}>
                        <Link to={`/admin/mailboxes/${m.id}`} className="block">
                          <div className="flex items-center gap-2.5">
                            <Dot tone={m.unread_count > 0 ? "warn" : "default"} />
                            <span className="font-mono-display text-[13px] font-bold text-foreground transition-colors group-hover:text-accent">{m.address}</span>
                          </div>
                          {m.note && <div className="mt-1 pl-5 text-[12.5px] leading-5 text-muted-foreground">{m.note}</div>}
                        </Link>
                      </td>
                      <td className={`${tableCellClass} num text-right font-semibold`}>{m.message_count}</td>
                      <td className={`${tableCellClass} num text-right`}>
                        {m.unread_count > 0 ? <span className="font-black text-warning">{m.unread_count}</span> : <span className="text-subtle">-</span>}
                      </td>
                      <td className={`${tableCellClass} whitespace-nowrap font-mono-display text-xs text-muted-foreground`}>{formatDate(m.last_received_at)}</td>
                      <td className="w-10 px-3 py-3 text-right text-muted-foreground transition-colors group-hover:text-accent">
                        <Link to={`/admin/mailboxes/${m.id}`} aria-label="打开邮箱">
                          {Icon.arrow}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
              <Pagination
                className="shrink-0"
                page={currentPage}
                pageSize={pageSize}
                total={sortedMailboxes.length}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
