import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, APIError, pagingQuery, type Paged } from "@/lib/api";
import { Badge, DataTable, EmptyState, Pagination, Panel, tableCellClass, tableHeadClass, tableHeaderCellClass, tableRowClass } from "@/components/ui";
import { formatDate, formatBytes } from "@/lib/format";

const DEFAULT_PAGE_SIZE = 20;

interface MailboxInfo {
  address: string;
  created_at: number;
  message_count: number;
  unread_count: number;
}

interface ViewerMessage {
  id: number;
  from_addr: string;
  subject: string;
  received_at: number;
  size: number;
  is_read: boolean;
}

export default function Viewer() {
  const { token } = useParams();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const mailbox = useQuery<MailboxInfo>({
    queryKey: ["v-mailbox", token],
    queryFn: () => api.get<MailboxInfo>(`/api/v/${token}/mailbox`),
    retry: false,
  });

  const messages = useQuery<Paged<ViewerMessage>>({
    queryKey: ["v-messages", token, page, pageSize],
    queryFn: () => api.get<Paged<ViewerMessage>>(`/api/v/${token}/messages?${pagingQuery(page, pageSize)}`),
    enabled: mailbox.isSuccess,
    retry: false,
  });

  if (mailbox.isLoading) {
    return (
      <ViewerShell>
        <Panel className="p-8 font-mono-display text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">正在加载邮箱...</Panel>
      </ViewerShell>
    );
  }
  if (mailbox.error) {
    const status = mailbox.error instanceof APIError ? mailbox.error.status : 0;
    return (
      <ViewerShell>
        <EmptyState title={status === 404 ? "链接无效或已过期" : "加载失败"} hint={status === 404 ? "请联系链接提供者重新生成访问链接。" : undefined} />
      </ViewerShell>
    );
  }

  const inbox = messages.data?.items ?? [];
  const messageTotal = messages.data?.total ?? mailbox.data?.message_count ?? inbox.length;
  const pageCount = Math.max(1, Math.ceil(messageTotal / pageSize));
  const currentPage = Math.min(page, pageCount);

  return (
    <ViewerShell>
      <section className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Panel className="overflow-hidden bg-primary p-5 text-primary-foreground md:p-7" accent>
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="mb-4 inline-flex border border-accent bg-accent px-3 py-1 font-mono-display text-[11px] font-bold uppercase tracking-[0.14em] text-accent-foreground rotate-[-2deg]">只读邮箱</div>
              <h1 className="break-all font-display text-[42px] font-black leading-[0.9] tracking-[-0.07em] sm:text-[56px] xl:text-[68px]">{mailbox.data?.address}</h1>
            </div>
          </div>
        </Panel>

        <Panel className="grid grid-cols-2 divide-x-2 divide-border overflow-hidden p-0 animate-rise" hover>
          <ViewerStat label="邮件数" value={mailbox.data?.message_count ?? 0} hint="累计接收" />
          <ViewerStat label="未读" value={mailbox.data?.unread_count ?? 0} hint={mailbox.data?.unread_count ? "仍需查看" : "全部已读"} highlight={Boolean(mailbox.data?.unread_count)} />
        </Panel>
      </section>

      {messages.isLoading && <Panel className="p-8 font-mono-display text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">正在加载邮件...</Panel>}
      {messages.data && inbox.length === 0 ? (
        <EmptyState title="收件箱为空" hint="新邮件投递后会自动显示在这里。" />
      ) : (
        inbox.length > 0 && (
          <>
            <div className="hidden md:block">
              <DataTable title="共享收件箱" meta={<>共 <span className="num font-semibold">{messageTotal}</span> 封</>} minWidth={760} maxHeight="none">
                <thead className={tableHeadClass}>
                  <tr>
                    <th className={tableHeaderCellClass}>状态</th>
                    <th className={tableHeaderCellClass}>发件人</th>
                    <th className={tableHeaderCellClass}>主题</th>
                    <th className={tableHeaderCellClass}>接收时间</th>
                    <th className={tableHeaderCellClass}>大小</th>
                  </tr>
                </thead>
                <tbody>
                  {inbox.map((m) => (
                    <tr key={m.id} className={tableRowClass}>
                      <td className={tableCellClass}>{m.is_read ? <Badge>已读</Badge> : <Badge tone="accent">未读</Badge>}</td>
                      <td className={tableCellClass}>
                        <Link to={`/v/${token}/messages/${m.id}`} className={m.is_read ? "block max-w-64 truncate font-mono-display text-muted-foreground hover:text-foreground" : "block max-w-64 truncate font-mono-display font-bold hover:text-accent"}>
                          {m.from_addr}
                        </Link>
                      </td>
                      <td className={tableCellClass}>
                        <Link to={`/v/${token}/messages/${m.id}`} className="block max-w-[34rem] truncate font-semibold hover:text-accent xl:max-w-[42rem]">
                          {m.subject || "(无主题)"}
                        </Link>
                      </td>
                      <td className={`${tableCellClass} whitespace-nowrap font-mono-display text-xs text-muted-foreground`}>{formatDate(m.received_at)}</td>
                      <td className={`${tableCellClass} whitespace-nowrap num font-mono-display text-xs text-muted-foreground`}>{formatBytes(m.size)}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </div>

            <Panel className="overflow-hidden md:hidden">
              <div className="flex items-center justify-between border-b-2 border-border bg-primary px-4 py-3 text-primary-foreground">
                <div className="font-mono-display text-xs font-bold uppercase tracking-[0.14em]">共享收件箱</div>
                <div className="text-xs opacity-80">共 <span className="num font-semibold">{messageTotal}</span> 封</div>
              </div>
              <div className="divide-y divide-hairline">
                {inbox.map((m) => (
                  <Link key={m.id} to={`/v/${token}/messages/${m.id}`} className="block px-4 py-4 transition-colors hover:bg-surface-muted/70">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      {m.is_read ? <Badge>已读</Badge> : <Badge tone="accent">未读</Badge>}
                      <span className="num shrink-0 font-mono-display text-[11px] text-muted-foreground">{formatBytes(m.size)}</span>
                    </div>
                    <div className="line-clamp-2 font-semibold leading-6">{m.subject || "(无主题)"}</div>
                    <div className="mt-3 flex flex-col gap-1 font-mono-display text-xs text-muted-foreground">
                      <span className="truncate">{m.from_addr}</span>
                      <span>{formatDate(m.received_at)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </Panel>

            <Pagination
              page={currentPage}
              pageSize={pageSize}
              total={messageTotal}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </>
        )
      )}
    </ViewerShell>
  );
}

function ViewerStat({ label, value, hint, highlight = false }: { label: string; value: number; hint: string; highlight?: boolean }) {
  return (
    <div className="p-5 md:p-6">
      <div className="font-mono-display text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className={highlight ? "num mt-5 font-display text-[46px] font-black leading-none tracking-[-0.07em] text-accent" : "num mt-5 font-display text-[46px] font-black leading-none tracking-[-0.07em] text-foreground"}>{value}</div>
      <div className="mt-3 text-[13px] leading-5 text-muted-foreground">{hint}</div>
    </div>
  );
}

export function ViewerShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen px-3 py-4 sm:px-5 md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 border-2 border-border bg-card px-4 py-3 shadow-hard md:px-5 md:py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="postal-border h-11 w-11 shrink-0 shadow-hard">
                <div className="flex h-full w-full items-center justify-center border-2 border-border bg-card font-display text-xl font-black text-accent">邮</div>
              </div>
              <div>
                <div className="font-display text-3xl font-black tracking-[-0.06em]">Cloudflare Email</div>
              </div>
            </div>
            <div className="w-fit border-2 border-border bg-surface-muted px-3 py-1 font-mono-display text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground shadow-hard">共享邮箱链接</div>
          </div>
        </header>
        <main className="animate-enter">{children}</main>
      </div>
    </div>
  );
}
