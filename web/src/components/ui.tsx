import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/format";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  CSSProperties,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

const iconBase = {
  back: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  ),
  empty: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16v12H4z" />
      <path d="M4 8l8 5 8-5" />
    </svg>
  ),
};

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "stamp";
type ButtonSize = "sm" | "md" | "lg";

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 border font-mono-display font-semibold uppercase tracking-[0.08em] transition-all duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-50",
        size === "sm" && "h-8 px-3 text-[11px]",
        size === "md" && "h-10 px-4 text-xs",
        size === "lg" && "h-12 px-5 text-[13px]",
        variant === "primary" && "border-primary bg-primary text-primary-foreground shadow-hard hover:-translate-y-0.5 hover:shadow-lift active:translate-y-0",
        variant === "secondary" && "border-border bg-card text-foreground shadow-hard hover:-translate-y-0.5 hover:bg-surface-elevated hover:shadow-lift active:translate-y-0",
        variant === "ghost" && "border-transparent bg-transparent text-muted-foreground hover:border-border hover:bg-surface-muted hover:text-foreground",
        variant === "danger" && "border-danger bg-danger text-destructive-foreground shadow-hard hover:-translate-y-0.5 hover:shadow-lift active:translate-y-0",
        variant === "stamp" && "stamp-cut border-accent bg-accent text-accent-foreground shadow-hard rotate-[-1.5deg] hover:rotate-0 hover:scale-[1.02]",
        className,
      )}
      {...rest}
    />
  );
}

export function LinkButton({
  variant = "secondary",
  size = "md",
  className,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: Exclude<ButtonVariant, "danger">;
  size?: ButtonSize;
}) {
  return (
    <a
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 border font-mono-display font-semibold uppercase tracking-[0.08em] transition-all duration-200 focus-visible:outline-none",
        size === "sm" && "h-8 px-3 text-[11px]",
        size === "md" && "h-10 px-4 text-xs",
        size === "lg" && "h-12 px-5 text-[13px]",
        variant === "primary" && "border-primary bg-primary text-primary-foreground shadow-hard hover:-translate-y-0.5 hover:shadow-lift",
        variant === "secondary" && "border-border bg-card text-foreground shadow-hard hover:-translate-y-0.5 hover:bg-surface-elevated hover:shadow-lift",
        variant === "ghost" && "border-transparent bg-transparent text-muted-foreground hover:border-border hover:bg-surface-muted hover:text-foreground",
        variant === "stamp" && "stamp-cut border-accent bg-accent text-accent-foreground shadow-hard rotate-[-1.5deg] hover:rotate-0 hover:scale-[1.02]",
        className,
      )}
      {...rest}
    />
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "flex h-11 w-full border-2 border-input bg-card px-3.5 py-2 text-[15px] shadow-inset transition-colors placeholder:text-subtle focus:border-accent focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...rest}
    />
  );
}

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "flex h-11 w-full border-2 border-input bg-card px-3.5 py-2 text-[15px] shadow-inset transition-colors focus:border-accent focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...rest}
    />
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "flex min-h-[112px] w-full border-2 border-input bg-card px-3.5 py-2 text-[15px] shadow-inset transition-colors placeholder:text-subtle focus:border-accent focus:outline-none focus:ring-0 disabled:opacity-50",
        className,
      )}
      {...rest}
    />
  );
}

export function Panel({
  children,
  className,
  hover,
  accent,
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  hover?: boolean;
  accent?: boolean;
}) {
  if (accent) {
    return (
      <div className={cn("postal-border p-[3px] shadow-hard", hover && "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift")}>
        <div
          className={cn(
            "relative h-full border-2 border-border bg-card text-card-foreground",
            "before:pointer-events-none before:absolute before:inset-0 before:bg-[linear-gradient(135deg,transparent_0,transparent_calc(100%-18px),hsl(var(--accent)/0.18)_calc(100%-18px),hsl(var(--accent)/0.18)_100%)]",
            className,
          )}
          {...rest}
        >
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative border-2 border-border bg-card text-card-foreground shadow-hard",
        "before:pointer-events-none before:absolute before:inset-0 before:bg-[linear-gradient(135deg,transparent_0,transparent_calc(100%-18px),hsl(var(--accent)/0.18)_calc(100%-18px),hsl(var(--accent)/0.18)_100%)]",
        hover && "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export const Card = Panel;

export function Badge({
  children,
  tone = "default",
  className,
}: {
  children: ReactNode;
  tone?: "default" | "success" | "warn" | "danger" | "accent" | "outline";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 border px-2 py-0.5 font-mono-display text-[11px] font-semibold uppercase tracking-[0.08em]",
        tone === "default" && "border-border bg-surface-muted text-muted-foreground",
        tone === "outline" && "border-border bg-transparent text-muted-foreground",
        tone === "success" && "border-success/40 bg-success-soft text-success",
        tone === "warn" && "border-warning/45 bg-warning-soft text-warning",
        tone === "danger" && "border-danger/40 bg-danger-soft text-danger",
        tone === "accent" && "border-accent/45 bg-accent-soft text-accent",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Dot({
  tone = "default",
  className,
}: {
  tone?: "default" | "success" | "warn" | "danger" | "accent";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block h-2.5 w-2.5 rounded-full border border-foreground/20",
        tone === "default" && "bg-surface-sunken",
        tone === "success" && "bg-success",
        tone === "warn" && "bg-warning",
        tone === "danger" && "bg-danger",
        tone === "accent" && "bg-accent",
        className,
      )}
    />
  );
}

export function PageHeader({
  title,
  eyebrow,
  subtitle,
  actions,
  className,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between", className)}>
      <div className="max-w-4xl">
        {eyebrow && <div className="mb-2 font-mono-display text-xs font-semibold uppercase tracking-[0.16em] text-accent">{eyebrow}</div>}
        <h1 className="font-display text-[38px] font-black leading-[0.92] tracking-[-0.055em] text-foreground md:text-[58px]">
          {title}
        </h1>
        {subtitle && <p className="mt-4 max-w-2xl text-[15px] leading-7 text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <Panel className="px-6 py-16 text-center" accent>
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center border-2 border-border bg-surface-muted text-accent shadow-hard rotate-[-3deg]">
        {iconBase.empty}
      </div>
      <div className="font-display text-3xl font-black tracking-[-0.04em]">{title}</div>
      {hint && <div className="mx-auto mt-3 max-w-md text-[14px] leading-6 text-muted-foreground">{hint}</div>}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </Panel>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block space-y-2", className)}>
      <span className="block font-mono-display text-[11px] font-bold uppercase tracking-[0.14em] text-foreground">{label}</span>
      {children}
      {hint && <span className="block text-xs leading-5 text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function Alert({
  tone = "default",
  title,
  children,
  className,
}: {
  tone?: "default" | "success" | "warn" | "danger";
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-2 px-4 py-3 text-[14px] leading-6 shadow-hard",
        tone === "default" && "border-border bg-card text-foreground",
        tone === "success" && "border-success/50 bg-success-soft text-success",
        tone === "warn" && "border-warning/50 bg-warning-soft text-warning",
        tone === "danger" && "border-danger/50 bg-danger-soft text-danger",
        className,
      )}
    >
      {title && <div className="mb-1 font-mono-display text-xs font-bold uppercase tracking-[0.12em] text-foreground">{title}</div>}
      {children}
    </div>
  );
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <a href={to} className="inline-flex items-center gap-2 font-mono-display text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-accent">
      {iconBase.back}
      {children}
    </a>
  );
}

export function DataTable({
  title,
  meta,
  minWidth = 760,
  maxHeight = 560,
  children,
  className,
}: {
  title?: ReactNode;
  meta?: ReactNode;
  minWidth?: number;
  maxHeight?: number | string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Panel className={cn("overflow-hidden", className)}>
      {(title || meta) && (
        <div className="flex items-center justify-between border-b-2 border-border bg-primary px-4 py-3 text-primary-foreground">
          {title && <div className="font-mono-display text-xs font-bold uppercase tracking-[0.14em]">{title}</div>}
          {meta && <div className="text-xs opacity-80">{meta}</div>}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto" style={{ maxHeight }}>
        <table className="w-full text-[14px]" style={{ minWidth }}>{children}</table>
      </div>
    </Panel>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(page, 1), pageCount);
  const start = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const end = Math.min(total, currentPage * pageSize);

  return (
    <div className={cn("mt-4 flex flex-col gap-3 border-2 border-border bg-card px-4 py-3 shadow-hard md:flex-row md:items-center md:justify-between", className)}>
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
        <div className="font-mono-display text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          显示 <span className="num text-foreground">{start}</span>-<span className="num text-foreground">{end}</span> / <span className="num text-foreground">{total}</span>
        </div>
        {onPageSizeChange && (
          <label className="flex items-center gap-2 font-mono-display text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            每页
            <Select className="h-8 w-20 px-2 py-1 text-[12px]" value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))}>
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </Select>
            条
          </label>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 md:flex-nowrap">
        <Button className="whitespace-nowrap" size="sm" variant="ghost" onClick={() => onPageChange(1)} disabled={currentPage <= 1}>
          首页
        </Button>
        <Button className="whitespace-nowrap" size="sm" variant="secondary" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage <= 1}>
          上一页
        </Button>
        <div className="min-w-20 border-2 border-border bg-surface-muted px-3 py-1.5 text-center font-mono-display text-[11px] font-bold uppercase tracking-[0.12em] text-foreground shadow-inset">
          <span className="num">{currentPage}</span> / <span className="num">{pageCount}</span>
        </div>
        <Button className="whitespace-nowrap" size="sm" variant="secondary" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage >= pageCount}>
          下一页
        </Button>
        <Button className="whitespace-nowrap" size="sm" variant="ghost" onClick={() => onPageChange(pageCount)} disabled={currentPage >= pageCount}>
          末页
        </Button>
      </div>
    </div>
  );
}

export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Panel className={cn("mb-5 px-4 py-3", className)}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">{children}</div>
    </Panel>
  );
}

export function Metric({
  label,
  value,
  hint,
  tone = "default",
  icon,
  delay = 0,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "accent" | "success" | "warn" | "danger";
  icon?: ReactNode;
  delay?: number;
}) {
  return (
    <Panel className="p-5 animate-rise" style={{ animationDelay: `${delay}ms` } as CSSProperties} hover>
      <div className="flex items-start justify-between gap-4">
        <div className="font-mono-display text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
        {icon && (
          <div
            className={cn(
              "flex h-9 w-9 items-center justify-center border-2 border-border bg-surface-muted shadow-hard",
              tone === "accent" && "border-accent/60 bg-accent-soft text-accent",
              tone === "success" && "border-success/40 bg-success-soft text-success",
              tone === "warn" && "border-warning/45 bg-warning-soft text-warning",
              tone === "danger" && "border-danger/45 bg-danger-soft text-danger",
            )}
          >
            {icon}
          </div>
        )}
      </div>
      <div className="num mt-5 font-display text-[46px] font-black leading-none tracking-[-0.07em] text-foreground">{value}</div>
      {hint && <div className="mt-3 text-[13px] leading-5 text-muted-foreground">{hint}</div>}
    </Panel>
  );
}

export const StatCard = Metric;

export function ConfirmPanel({
  title,
  children,
  confirmLabel = "确认",
  cancelLabel = "取消",
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/45 px-4 backdrop-blur-sm">
      <Panel className="w-full max-w-md p-6 animate-enter" accent>
        <div className="font-display text-3xl font-black tracking-[-0.05em]">{title}</div>
        <div className="mt-3 text-[14px] leading-6 text-muted-foreground">{children}</div>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={busy}>
            {busy ? "处理中…" : confirmLabel}
          </Button>
        </div>
      </Panel>
    </div>
  );
}

export function AttachmentList({
  attachments,
  hrefFor,
}: {
  attachments: { id: number; filename: string; size: number }[];
  hrefFor: (id: number) => string;
}) {
  if (attachments.length === 0) return null;
  return (
    <Panel className="mb-5 p-5">
      <div className="mb-4 font-mono-display text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">附件</div>
      <div className="flex flex-wrap gap-2">
        {attachments.map((a) => (
          <a key={a.id} href={hrefFor(a.id)} className="group inline-flex items-center gap-3 border-2 border-border bg-surface-elevated px-3 py-2 text-xs font-semibold shadow-hard transition-all hover:-translate-y-0.5 hover:bg-card hover:shadow-lift">
            <span className="max-w-[240px] truncate">{a.filename}</span>
            <span className="font-mono-display text-muted-foreground group-hover:text-accent">{formatBytes(a.size)}</span>
          </a>
        ))}
      </div>
    </Panel>
  );
}

export function MailBody({
  html,
  text,
  className,
  bodyClassName,
}: {
  html?: string;
  text?: string;
  className?: string;
  bodyClassName?: string;
}) {
  const hasHTML = !!html;
  const hasText = !!text;
  return (
    <Panel className={cn("overflow-hidden", className)}>
      {hasHTML ? (
        <SandboxedHTML html={html} className={bodyClassName} />
      ) : hasText ? (
        <pre className={cn("whitespace-pre-wrap break-words bg-card p-5 font-sans text-[15px] leading-7", bodyClassName)}>{text}</pre>
      ) : (
        <div className="p-10 text-center text-sm text-muted-foreground">邮件正文为空</div>
      )}
    </Panel>
  );
}

function SandboxedHTML({ html, className }: { html: string; className?: string }) {
  const csp = "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; font-src data:";
  const wrapped = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>body{font-family:'Avenir Next','Gill Sans','PingFang SC','Microsoft YaHei',sans-serif;color:#111827;margin:24px;line-height:1.62;background:#fffaf0}a{color:#d94a1e}</style></head><body>${html}</body></html>`;
  return <iframe title="邮件正文" sandbox="" srcDoc={wrapped} className={cn("h-[660px] w-full border-0 bg-white", className)} />;
}

export const tableHeadClass = "sticky top-0 z-10 border-b-2 border-border bg-surface-muted text-left font-mono-display text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground";
export const tableHeaderCellClass = "px-4 py-3";
export const tableRowClass = "group border-b border-hairline transition-colors last:border-b-0 hover:bg-accent-soft/45";
export const tableCellClass = "px-4 py-3.5 align-middle";
