import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { Alert, Badge, Button, Input, Panel } from "@/components/ui";
import { APIError, api, type SystemConfig as SystemConfigData } from "@/lib/api";

type UpdateSystemConfig = {
  ingest_token?: string;
  ingest_secret?: string;
  session_secret?: string;
  admin_username?: string;
  admin_password?: string;
  admin_api_key?: string;
  retention_days?: number;
  auto_cleanup?: boolean;
};

export default function SystemConfig() {
  const qc = useQueryClient();
  const config = useQuery<SystemConfigData>({
    queryKey: ["system-config"],
    queryFn: () => api.get<SystemConfigData>("/api/admin/system-config"),
  });

  const [ingestToken, setIngestToken] = useState("");
  const [ingestSecret, setIngestSecret] = useState("");
  const [sessionSecret, setSessionSecret] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminAPIKey, setAdminAPIKey] = useState("");
  const [retentionDays, setRetentionDays] = useState(0);
  const [autoCleanup, setAutoCleanup] = useState(false);
  const [showIngestToken, setShowIngestToken] = useState(false);
  const [copiedIngestToken, setCopiedIngestToken] = useState(false);
  const [showAdminAPIKey, setShowAdminAPIKey] = useState(false);
  const [copiedAdminAPIKey, setCopiedAdminAPIKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);

  useEffect(() => {
    if (!config.data) return;
    setIngestToken(config.data.ingest_token);
    setIngestSecret("");
    setSessionSecret("");
    setAdminUsername(config.data.admin_username);
    setAdminPassword("");
    setAdminAPIKey(config.data.admin_api_key);
    setRetentionDays(config.data.retention_days);
    setAutoCleanup(config.data.auto_cleanup);
  }, [config.data]);

  const update = useMutation({
    mutationFn: (body: UpdateSystemConfig) => api.patch<SystemConfigData>("/api/admin/system-config", body),
    onSuccess: (data) => {
      qc.setQueryData(["system-config"], data);
      qc.invalidateQueries({ queryKey: ["me"] });
      setIngestSecret("");
      setSessionSecret("");
      setAdminPassword("");
      setSaved(true);
    },
  });

  const current = config.data;
  const isBusy = config.isLoading || update.isPending;
  const hasChanges =
    !!current &&
    ((current.editable.ingest_token && ingestToken !== current.ingest_token) ||
      (current.editable.ingest_secret && !!ingestSecret) ||
      (current.editable.session_secret && !!sessionSecret) ||
      (current.editable.admin_username && adminUsername !== current.admin_username) ||
      (current.editable.admin_password && !!adminPassword) ||
      (current.editable.admin_api_key && adminAPIKey !== current.admin_api_key) ||
      retentionDays !== current.retention_days ||
      autoCleanup !== current.auto_cleanup);
  const canSave = !!current && !isBusy && hasChanges;
  const editableCount = current ? Object.values(current.editable).filter(Boolean).length : 0;

  function save() {
    if (!current) return;
    setSaved(false);

    const body: UpdateSystemConfig = {};
    if (current.editable.ingest_token && ingestToken !== current.ingest_token) body.ingest_token = ingestToken;
    if (current.editable.ingest_secret && ingestSecret) body.ingest_secret = ingestSecret;
    if (current.editable.session_secret && sessionSecret) body.session_secret = sessionSecret;
    if (current.editable.admin_username && adminUsername !== current.admin_username) body.admin_username = adminUsername;
    if (current.editable.admin_password && adminPassword) body.admin_password = adminPassword;
    if (current.editable.admin_api_key && adminAPIKey !== current.admin_api_key) body.admin_api_key = adminAPIKey;
    if (retentionDays !== current.retention_days) body.retention_days = retentionDays;
    if (autoCleanup !== current.auto_cleanup) body.auto_cleanup = autoCleanup;

    update.mutate(body);
  }

  function reset() {
    if (!current) return;
    setIngestToken(current.ingest_token);
    setIngestSecret("");
    setSessionSecret("");
    setAdminUsername(current.admin_username);
    setAdminPassword("");
    setAdminAPIKey(current.admin_api_key);
    setRetentionDays(current.retention_days);
    setAutoCleanup(current.auto_cleanup);
    setShowIngestToken(false);
    setCopiedIngestToken(false);
    setShowAdminAPIKey(false);
    setCopiedAdminAPIKey(false);
    setSaved(false);
  }

  async function copyIngestToken() {
    if (!ingestToken) return;
    await navigator.clipboard.writeText(ingestToken);
    setCopiedIngestToken(true);
  }

  const manualCleanup = useMutation({
    mutationFn: (days: number) => api.post<{ deleted: number }>("/api/admin/messages/cleanup", { days }),
    onSuccess: (data) => {
      setCleanupResult(`已清理 ${data.deleted} 封邮件`);
      qc.invalidateQueries({ queryKey: ["mailboxes"] });
      qc.invalidateQueries({ queryKey: ["messages"] });
    },
  });

  async function copyAdminAPIKey() {
    if (!adminAPIKey) return;
    await navigator.clipboard.writeText(adminAPIKey);
    setCopiedAdminAPIKey(true);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <div className="flex shrink-0 flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <h1 className="font-display text-[36px] font-black leading-none tracking-[-0.055em] text-foreground md:text-[48px]">系统配置</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={hasChanges ? "warn" : "success"}>{hasChanges ? "待保存" : "已同步"}</Badge>
          <Badge tone="outline">网页可改 {editableCount} 项</Badge>
          <Button onClick={save} disabled={!canSave} variant="stamp">
            {update.isPending ? "保存中..." : hasChanges ? "保存配置" : "暂无变更"}
          </Button>
          <Button type="button" variant="secondary" disabled={!current || isBusy} onClick={reset}>
            重置
          </Button>
        </div>
      </div>

      <Panel className="min-h-0 flex-1 overflow-hidden p-4 md:p-5" accent>
        <div className="space-y-3">
          {config.isLoading ? <Alert className="py-2">正在加载系统配置...</Alert> : null}
          {config.error ? <Alert className="py-2" tone="danger">{errorMessage(config.error)}</Alert> : null}
          {update.error ? <Alert className="py-2" tone="danger">{errorMessage(update.error)}</Alert> : null}
          {saved && !update.error ? <Alert className="py-2" tone="success">系统配置已保存。</Alert> : null}
        </div>

        <div className="mt-4 grid gap-x-5 gap-y-3 xl:grid-cols-2">
          <ManagedSecretField
            label="INGEST_TOKEN"
            hint={current?.editable.ingest_token ? "Worker 调用 /ingest/email 使用。" : "由环境变量 INGEST_TOKEN 接管。"}
            value={ingestToken}
            onChange={(value) => {
              setIngestToken(value);
              setCopiedIngestToken(false);
              setSaved(false);
            }}
            disabled={!current?.editable.ingest_token || isBusy}
            editable={!!current?.editable.ingest_token}
            configured={!!ingestToken}
            revealed={showIngestToken}
            onReveal={() => setShowIngestToken((show) => !show)}
            copied={copiedIngestToken}
            onCopy={copyIngestToken}
            onGenerate={() => {
              setIngestToken(generateSecret());
              setShowIngestToken(true);
              setCopiedIngestToken(false);
              setSaved(false);
            }}
          />
          <ManagedSecretField
            label="ADMIN_API_KEY"
            hint={current?.editable.admin_api_key ? "管理员接口 Bearer Token。" : "由环境变量 ADMIN_API_KEY 接管。"}
            value={adminAPIKey}
            onChange={(value) => {
              setAdminAPIKey(value);
              setCopiedAdminAPIKey(false);
              setSaved(false);
            }}
            disabled={!current?.editable.admin_api_key || isBusy}
            editable={!!current?.editable.admin_api_key}
            configured={!!adminAPIKey}
            revealed={showAdminAPIKey}
            onReveal={() => setShowAdminAPIKey((show) => !show)}
            copied={copiedAdminAPIKey}
            onCopy={copyAdminAPIKey}
            onGenerate={() => {
              setAdminAPIKey(generateSecret());
              setShowAdminAPIKey(true);
              setCopiedAdminAPIKey(false);
              setSaved(false);
            }}
          />
          <WriteOnlySecretField
            label="INGEST_SECRET"
            hint={current?.editable.ingest_secret ? "Worker 签名校验密钥，留空不修改。" : "由环境变量 INGEST_SECRET 接管。"}
            value={ingestSecret}
            onChange={(value) => {
              setIngestSecret(value);
              setSaved(false);
            }}
            disabled={!current?.editable.ingest_secret || isBusy}
            editable={!!current?.editable.ingest_secret}
            configured={!!current?.ingest_secret_set}
            placeholder={current?.ingest_secret_set ? "留空则不修改" : "请输入新密钥"}
          />
          <WriteOnlySecretField
            label="SESSION_SECRET"
            hint={current?.editable.session_secret ? "后台会话签名密钥，留空不修改。" : "由环境变量 SESSION_SECRET 接管。"}
            value={sessionSecret}
            onChange={(value) => {
              setSessionSecret(value);
              setSaved(false);
            }}
            disabled={!current?.editable.session_secret || isBusy}
            editable={!!current?.editable.session_secret}
            configured={!!current?.session_secret_set}
            placeholder={current?.session_secret_set ? "留空则不修改" : "请输入新密钥"}
          />
          <PlainConfigField
            label="管理员用户名"
            hint={current?.editable.admin_username ? "用于登录后台管理页面。" : "由环境变量 ADMIN_USERNAME 接管。"}
            editable={!!current?.editable.admin_username}
            configured={!!adminUsername}
          >
            <Input
              value={adminUsername}
              onChange={(e) => {
                setAdminUsername(e.target.value);
                setSaved(false);
              }}
              disabled={!current?.editable.admin_username || isBusy}
              autoComplete="username"
            />
          </PlainConfigField>
          <PlainConfigField
            label="管理员密码"
            hint={current?.editable.admin_password ? "留空则不修改现有密码。" : "由环境变量 ADMIN_PASSWORD 接管。"}
            editable={!!current?.editable.admin_password}
            configured={!!current?.admin_password_set}
          >
            <Input
              type="password"
              value={adminPassword}
              onChange={(e) => {
                setAdminPassword(e.target.value);
                setSaved(false);
              }}
              disabled={!current?.editable.admin_password || isBusy}
              placeholder={current?.admin_password_set ? "留空则不修改" : "请输入新密码"}
              autoComplete="new-password"
            />
          </PlainConfigField>
        </div>
      </Panel>

      <Panel className="shrink-0 p-4 md:p-5" accent>
        <div className="mb-3 font-mono-display text-[11px] font-bold uppercase tracking-[0.14em] text-foreground">邮件保留策略</div>
        <div className="grid gap-x-5 gap-y-3 xl:grid-cols-2">
          <div className="border-2 border-hairline/80 bg-card/60 p-3 shadow-inset">
            <div className="mb-2 font-mono-display text-[11px] font-bold uppercase tracking-[0.14em] text-foreground">保留天数</div>
            <Input
              type="number"
              min={0}
              value={retentionDays}
              onChange={(e) => {
                setRetentionDays(Math.max(0, parseInt(e.target.value) || 0));
                setSaved(false);
              }}
              disabled={isBusy}
            />
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">超过此天数的邮件将被清理。设为 0 表示永久保留。</p>
          </div>
          <div className="border-2 border-hairline/80 bg-card/60 p-3 shadow-inset">
            <div className="mb-2 font-mono-display text-[11px] font-bold uppercase tracking-[0.14em] text-foreground">自动清理</div>
            <div className="flex items-center gap-3">
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={autoCleanup}
                  onChange={(e) => {
                    setAutoCleanup(e.target.checked);
                    setSaved(false);
                  }}
                  disabled={isBusy}
                />
                <div className="h-6 w-11 rounded-full border-2 border-hairline bg-surface-elevated after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-hairline after:bg-foreground after:transition-all peer-checked:border-accent peer-checked:bg-accent peer-checked:after:translate-x-full peer-disabled:cursor-not-allowed peer-disabled:opacity-50" />
              </label>
              <Badge tone={autoCleanup ? "success" : "outline"}>{autoCleanup ? "已开启" : "未开启"}</Badge>
            </div>
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">开启后系统每小时自动清理过期邮件。需要同时设置保留天数。</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            variant="danger"
            size="sm"
            disabled={retentionDays <= 0 || manualCleanup.isPending || isBusy}
            onClick={() => manualCleanup.mutate(retentionDays)}
          >
            {manualCleanup.isPending ? "清理中..." : "立即清理"}
          </Button>
          <span className="text-xs text-muted-foreground">
            {retentionDays > 0 ? `将删除 ${retentionDays} 天前的邮件` : "请先设置保留天数"}
          </span>
          {cleanupResult && <Badge tone="success">{cleanupResult}</Badge>}
          {manualCleanup.error && <Badge tone="danger">{errorMessage(manualCleanup.error)}</Badge>}
        </div>
      </Panel>
    </div>
  );
}

function PlainConfigField({
  label,
  hint,
  editable,
  configured,
  children,
}: {
  label: string;
  hint: string;
  editable: boolean;
  configured: boolean;
  children: ReactNode;
}) {
  return (
    <ConfigFieldShell label={label} hint={hint} editable={editable} configured={configured}>
      {children}
    </ConfigFieldShell>
  );
}

function ManagedSecretField({
  label,
  hint,
  value,
  onChange,
  disabled,
  editable,
  configured,
  revealed,
  onReveal,
  copied,
  onCopy,
  onGenerate,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  editable: boolean;
  configured: boolean;
  revealed: boolean;
  onReveal: () => void;
  copied: boolean;
  onCopy: () => void;
  onGenerate: () => void;
}) {
  const revealDisabled = !value || (disabled && editable);

  return (
    <ConfigFieldShell label={label} hint={hint} editable={editable} configured={configured}>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <Input
          type={revealed ? "text" : "password"}
          className="min-w-0 font-mono-display text-[13px] tracking-[0.04em]"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          readOnly={!editable}
          spellCheck={false}
          autoComplete="off"
        />
        <div className="grid grid-cols-3 gap-2 sm:flex sm:shrink-0">
          <Button type="button" size="sm" variant="secondary" className="whitespace-nowrap px-3" disabled={revealDisabled} onClick={onReveal}>
            {revealed ? "隐藏" : "显示"}
          </Button>
          <Button type="button" size="sm" variant="secondary" className="whitespace-nowrap px-3" disabled={revealDisabled} onClick={onCopy}>
            {copied ? "已复制" : "复制"}
          </Button>
          <Button type="button" size="sm" variant="secondary" className="whitespace-nowrap px-3" disabled={disabled} onClick={onGenerate}>
            自动生成
          </Button>
        </div>
      </div>
    </ConfigFieldShell>
  );
}

function WriteOnlySecretField({
  label,
  hint,
  value,
  onChange,
  disabled,
  editable,
  configured,
  placeholder,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  editable: boolean;
  configured: boolean;
  placeholder: string;
}) {
  const [revealed, setRevealed] = useState(false);

  return (
    <ConfigFieldShell label={label} hint={hint} editable={editable} configured={configured}>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <Input
          type={revealed ? "text" : "password"}
          className="min-w-0 font-mono-display text-[13px] tracking-[0.04em]"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
        />
        <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
          <Button type="button" size="sm" variant="secondary" className="whitespace-nowrap px-3" disabled={!value || disabled} onClick={() => setRevealed((show) => !show)}>
            {revealed ? "隐藏" : "显示"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="whitespace-nowrap px-3"
            disabled={disabled}
            onClick={() => {
              onChange(generateSecret());
              setRevealed(true);
            }}
          >
            自动生成
          </Button>
        </div>
      </div>
    </ConfigFieldShell>
  );
}

function ConfigFieldShell({
  label,
  hint,
  editable,
  configured,
  children,
}: {
  label: string;
  hint: string;
  editable: boolean;
  configured: boolean;
  children: ReactNode;
}) {
  return (
    <div className="border-2 border-hairline/80 bg-card/60 p-3 shadow-inset">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="break-all font-mono-display text-[11px] font-bold uppercase tracking-[0.14em] text-foreground">{label}</div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={editable ? "accent" : "outline"}>{editable ? "可修改" : "环境变量"}</Badge>
          <Badge tone={configured ? "success" : "warn"}>{configured ? "已配置" : "未配置"}</Badge>
        </div>
      </div>
      {children}
      <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{hint}</p>
    </div>
  );
}

function generateSecret() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function errorMessage(err: unknown) {
  if (err instanceof APIError) return err.message;
  if (err instanceof Error) return err.message;
  return "请求失败";
}
