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
  const [showIngestToken, setShowIngestToken] = useState(false);
  const [copiedIngestToken, setCopiedIngestToken] = useState(false);
  const [showAdminAPIKey, setShowAdminAPIKey] = useState(false);
  const [copiedAdminAPIKey, setCopiedAdminAPIKey] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!config.data) return;
    setIngestToken(config.data.ingest_token);
    setIngestSecret("");
    setSessionSecret("");
    setAdminUsername(config.data.admin_username);
    setAdminPassword("");
    setAdminAPIKey(config.data.admin_api_key);
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
      (current.editable.admin_api_key && adminAPIKey !== current.admin_api_key));
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
