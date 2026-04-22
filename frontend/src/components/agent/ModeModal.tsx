import { useState, useEffect } from 'react';
import {
  assistantApi,
  type BellaMode,
  type AssistantConfig,
  type BellaRuntimeOptions,
  type AssistantFrameworkConfig,
  type AgentFramework,
  type FrameworkSwitchMode,
} from '../../api/assistant';
import { useBellaAuth } from '../../contexts/BellaAuthContext';
import { useMode } from '../../contexts/ModeContext';

interface ModeModalProps {
  open: boolean;
  onClose: () => void;
}

type FrameworkSwitchStage = 'idle' | 'checking_idle' | 'migrating' | 'completed' | 'blocked' | 'failed';

export default function ModeModal({ open, onClose }: ModeModalProps) {
  const { mode: currentMode, setMode } = useMode();
  const { user, settings, loading: authLoading, refresh, updateSettings, openAuthModal } = useBellaAuth();
  const [config, setConfig] = useState<AssistantConfig | null>(null);
  const [frameworkConfig, setFrameworkConfig] = useState<AssistantFrameworkConfig | null>(null);
  const [selectedContextStrategy, setSelectedContextStrategy] = useState<'last_20_turns' | 'full_with_summary'>('last_20_turns');
  const [switchingFramework, setSwitchingFramework] = useState(false);
  const [switchStage, setSwitchStage] = useState<FrameworkSwitchStage>('idle');
  const [switchStatusText, setSwitchStatusText] = useState('');
  const [switchFollowUps, setSwitchFollowUps] = useState<string[]>([]);
  const [switchCommand, setSwitchCommand] = useState('');
  const [switchMode, setSwitchMode] = useState<FrameworkSwitchMode>('full_migrate');
  const [migrateSecrets, setMigrateSecrets] = useState(true);
  const [workspaceTarget, setWorkspaceTarget] = useState('');
  const [pendingSwitchTarget, setPendingSwitchTarget] = useState<AgentFramework | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [companionOpen, setCompanionOpen] = useState(false);
  const [copiedUserId, setCopiedUserId] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    assistantApi
      .getConfig(currentMode)
      .then(setConfig)
      .catch(() => setConfig(null))
      .finally(() => setLoading(false));

    assistantApi
      .getFrameworkConfig()
      .then((data) => {
        setFrameworkConfig(data);
        setSelectedContextStrategy(data.contextStrategyDefault);
        setSwitchStage('idle');
        setSwitchStatusText('');
        setSwitchFollowUps([]);
        setSwitchCommand('');
      })
      .catch(() => {
        setFrameworkConfig(null);
      });
  }, [open, currentMode]);

  useEffect(() => {
    if (!open) {
      setCompanionOpen(false);
    }
  }, [open]);

  useEffect(() => {
    if (companionOpen) void refresh();
  }, [companionOpen, refresh]);

  const handleModeChange = (m: BellaMode) => {
    setMode(m);
    setLoading(true);
    assistantApi
      .getConfig(m)
      .then(setConfig)
      .catch(() => setConfig(null))
      .finally(() => setLoading(false));
  };

  if (!open) return null;

  const isZh = currentMode === 'china';
  const options: BellaRuntimeOptions | null = config?.runtimeOptions ?? null;

  const setRuntimeOption = async (patch: Partial<BellaRuntimeOptions>) => {
    if (!options) return;
    setSaving(true);
    const prev = options;
    const next = { ...prev, ...patch };
    setConfig((old) => (old ? { ...old, runtimeOptions: next } : old));
    try {
      const updated = await assistantApi.updateRuntimeOptions(currentMode, patch);
      setConfig((old) => (old ? { ...old, runtimeOptions: updated.runtimeOptions } : old));
    } catch {
      setConfig((old) => (old ? { ...old, runtimeOptions: prev } : old));
    } finally {
      setSaving(false);
    }
  };

  const resetRuntimeOptions = async () => {
    if (!options) return;
    setSaving(true);
    const prev = options;
    try {
      const updated = await assistantApi.resetRuntimeOptions(currentMode);
      setConfig((old) => (old ? { ...old, runtimeOptions: updated.runtimeOptions } : old));
    } catch {
      setConfig((old) => (old ? { ...old, runtimeOptions: prev } : old));
    } finally {
      setSaving(false);
    }
  };

  const executeSwitchFramework = async (targetFramework: AgentFramework) => {
    if (!frameworkConfig || switchingFramework || frameworkConfig.framework === targetFramework) return;
    setSwitchingFramework(true);
    setSwitchFollowUps([]);
    setSwitchCommand('');
    setSwitchStage('checking_idle');
    setSwitchStatusText(isZh ? '正在检查是否可切换（idle）...' : 'Checking if framework switch is allowed (idle check)...');
    try {
      setSwitchStage('migrating');
      setSwitchStatusText(
        switchMode === 'full_migrate'
          ? (isZh ? '正在迁移上下文并同步 Hermes 资产...' : 'Migrating context and syncing Hermes assets...')
          : (isZh ? '正在迁移上下文（runtime only）...' : 'Migrating context (runtime only)...')
      );
      const result = await assistantApi.switchFramework(targetFramework, selectedContextStrategy, {
        switchMode,
        migrateSecrets,
        workspaceTarget: workspaceTarget.trim() || undefined,
      });
      if (!result.ok) {
        if (result.code === 'SWITCH_BLOCKED_NOT_IDLE') {
          const inFlight = result.blocking?.inFlightRequests ?? 0;
          const activeJobs = result.blocking?.activeJobs ?? 0;
          setSwitchStage('blocked');
          setSwitchStatusText(
            isZh
              ? `当前任务仍在运行，请稍后重试（activeJobs=${activeJobs}, inFlight=${inFlight}）`
              : `Current task is still running. Try again later (activeJobs=${activeJobs}, inFlight=${inFlight}).`
          );
        } else if (result.code === 'SWITCH_TARGET_SAME_AS_CURRENT') {
          setSwitchStage('blocked');
          setSwitchStatusText(isZh ? '目标框架与当前一致。' : 'Target framework is already current.');
        } else if (result.code === 'SWITCH_HERMES_MIGRATION_FAILED') {
          setSwitchStage('failed');
          setSwitchStatusText(
            result.message ||
              (isZh ? 'Hermes 官方迁移失败，框架未切换。请检查迁移输出后重试。' : 'Hermes migration failed and switch was not applied.')
          );
        } else {
          setSwitchStage('failed');
          setSwitchStatusText(result.message || (isZh ? '上下文迁移失败，请重试。' : 'Context migration failed. Please retry.'));
        }
      } else {
        setSwitchFollowUps(result.frameworkMigration?.followUps || []);
        if (result.frameworkMigration?.command) setSwitchCommand(result.frameworkMigration.command);
        setSwitchStage('completed');
        if (result.observability && result.observability.pendingBackgroundWrites > 0) {
          setSwitchStatusText(
            isZh
              ? `切换完成（迁移 ${result.migration.turnsMigrated} turns，模式=${result.switchMode}），仍有 ${result.observability.pendingBackgroundWrites} 条记忆写入在后台进行。`
              : `Switch completed (${result.migration.turnsMigrated} turns, mode=${result.switchMode}). ${result.observability.pendingBackgroundWrites} memory writes are still running in background.`
          );
        } else {
          setSwitchStatusText(
            isZh
              ? `切换完成（迁移 ${result.migration.turnsMigrated} turns，模式=${result.switchMode}）。`
              : `Switch completed (${result.migration.turnsMigrated} turns, mode=${result.switchMode}).`
          );
        }
        const latest = await assistantApi.getFrameworkConfig();
        setFrameworkConfig(latest);
      }
    } catch {
      setSwitchStage('failed');
      setSwitchStatusText(isZh ? '框架切换失败，请稍后重试。' : 'Failed to switch framework. Please retry.');
    } finally {
      setSwitchingFramework(false);
    }
  };

  const requestSwitchFramework = (targetFramework: AgentFramework) => {
    if (!frameworkConfig || switchingFramework || frameworkConfig.framework === targetFramework) return;
    setPendingSwitchTarget(targetFramework);
  };

  const switchStatusColorClass =
    switchStage === 'completed'
      ? 'text-emerald-300'
      : switchStage === 'blocked' || switchStage === 'failed'
        ? 'text-rose-300'
        : switchStage === 'checking_idle' || switchStage === 'migrating'
          ? 'text-amber-200'
          : 'text-white/70';

  return (
    <>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bella-modal p-0 max-h-[min(90vh,720px)] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-6 pb-3 flex-shrink-0 border-b border-amber-900/10">
          <div className="bella-modal-header !mb-0">
            <h3 className="bella-modal-title">
              {isZh ? '模式与能力' : 'Mode & Capabilities'}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="bella-modal-close"
            >
              ×
            </button>
          </div>
        </div>

        <div className="bella-modal-scroll flex-1 min-h-0 px-6 py-4">
        <div className="space-y-4">
          <div>
            <label className="bella-label">
              {isZh ? '区域模式' : 'Region Mode'}
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleModeChange('china')}
                className={`flex-1 bella-toggle-btn ${currentMode === 'china' ? 'is-active' : ''}`}
              >
                {isZh ? '国内 China' : 'China'}
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('world')}
                className={`flex-1 bella-toggle-btn ${currentMode === 'world' ? 'is-active' : ''}`}
              >
                {isZh ? '国际 World' : 'World'}
              </button>
            </div>
          </div>

          <div>
            <label className="bella-label">{isZh ? 'Agent 框架' : 'Agent framework'}</label>
            {frameworkConfig ? (
              <div className="space-y-2 mt-1">
                <p className="text-sm bella-kv">
                  {isZh ? '当前：' : 'Current: '}
                  <span className="mono">{frameworkConfig.framework}</span>
                </p>
                <div className="flex gap-2">
                  {frameworkConfig.availableFrameworks.map((fw) => {
                    const active = frameworkConfig.framework === fw;
                    return (
                      <button
                        key={fw}
                        type="button"
                        disabled={switchingFramework || active}
                        onClick={() => requestSwitchFramework(fw)}
                        className={`flex-1 bella-toggle-btn ${active ? 'is-active' : ''}`}
                      >
                        {fw === 'openclaw' ? 'OpenClaw' : 'Hermes'}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2 text-xs bella-kv">
                  <span>{isZh ? '迁移策略' : 'Context strategy'}</span>
                  <select
                    className="bella-select text-xs"
                    value={selectedContextStrategy}
                    onChange={(e) =>
                      setSelectedContextStrategy(
                        e.target.value === 'full_with_summary' ? 'full_with_summary' : 'last_20_turns'
                      )
                    }
                    disabled={switchingFramework}
                  >
                    <option value="last_20_turns">last_20_turns</option>
                    <option value="full_with_summary">full_with_summary</option>
                  </select>
                </div>
                <div className="grid gap-1.5 text-xs bella-kv">
                  <label className="flex items-center justify-between gap-2">
                    <span>{isZh ? '切换模式' : 'Switch mode'}</span>
                    <select
                      className="bella-select text-xs"
                      value={switchMode}
                      onChange={(e) =>
                        setSwitchMode(e.target.value === 'runtime_only' ? 'runtime_only' : 'full_migrate')
                      }
                      disabled={switchingFramework}
                    >
                      <option value="full_migrate">
                        {isZh ? 'full_migrate（推荐）' : 'full_migrate (recommended)'}
                      </option>
                      <option value="runtime_only">runtime_only</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={migrateSecrets}
                      disabled={switchingFramework || switchMode === 'runtime_only'}
                      onChange={(e) => setMigrateSecrets(e.target.checked)}
                    />
                    <span>{isZh ? '迁移密钥（migrate-secrets）' : 'Migrate secrets (migrate-secrets)'}</span>
                  </label>
                  <label className="grid gap-1">
                    <span>{isZh ? '工作区目标（可选）' : 'Workspace target (optional)'}</span>
                    <input
                      className="w-full rounded-lg bg-black/30 border border-white/10 px-2 py-1.5 text-xs"
                      value={workspaceTarget}
                      onChange={(e) => setWorkspaceTarget(e.target.value)}
                      disabled={switchingFramework || switchMode === 'runtime_only'}
                      placeholder={isZh ? '/home/you/projects/xxx' : '/home/you/projects/xxx'}
                    />
                  </label>
                </div>
                {switchStatusText ? (
                  <div className="space-y-1">
                    <p className={`text-xs ${switchStatusColorClass}`}>{switchStatusText}</p>
                    {switchCommand ? <p className="text-[11px] text-white/45 mono break-all">{switchCommand}</p> : null}
                    {switchFollowUps.length > 0 ? (
                      <ul className="list-disc pl-4 text-[11px] text-white/60 space-y-0.5">
                        {switchFollowUps.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-xs bella-label mt-1">
                {isZh ? '框架信息加载失败' : 'Failed to load framework settings'}
              </p>
            )}
          </div>

          <div>
            <label className="bella-label">{isZh ? '伴侣记忆（gbrain）' : 'Companion memory (gbrain)'}</label>
            <button
              type="button"
              onClick={() => setCompanionOpen(true)}
              className="bella-btn-outline text-xs w-full justify-center mt-1 flex items-center gap-1.5"
            >
              {isZh ? '查看登录状态与记忆开关…' : 'View sign-in status & memory toggles…'}
            </button>
          </div>

          {loading ? (
            <div className="py-4 text-center bella-label text-sm">
              {isZh ? '加载中...' : 'Loading...'}
            </div>
          ) : config ? (
            <>
              <div>
                <label className="bella-label mb-1">
                  {isZh ? 'Bella 模型' : 'Bella Model'}
                </label>
                <p className="text-sm bella-kv mono">{config.model}</p>
              </div>
              <div>
                <label className="bella-label mb-2">
                  {isZh ? 'OpenClaw Skills' : 'OpenClaw Skills'}
                </label>
                <ul
                  className={`space-y-1.5 ${config.skills.length > 8 ? 'bella-skill-list-scroll' : ''}`}
                >
                  {config.skills.map((s) => (
                    <li key={s.id} className="flex items-start gap-2 text-sm bella-kv">
                      <span className="font-medium">{s.name}:</span>
                      <span className="opacity-80">{s.summary}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <label className="bella-label mb-1.5">
                  {isZh ? '搜索策略开关（当前模式）' : 'Search Policy Toggles (Current Mode)'}
                </label>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-3 text-sm bella-kv leading-snug">
                    <span className="min-w-0 pr-1">{isZh ? '搜索失败后 browser 回退到 Bing' : 'Fallback browser search to Bing on failure'}</span>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() =>
                        void setRuntimeOption({ searchBrowserFallbackToBing: !options?.searchBrowserFallbackToBing })
                      }
                      className={`shrink-0 bella-toggle-btn bella-toggle-btn-compact ${options?.searchBrowserFallbackToBing ? 'is-active' : ''}`}
                    >
                      {options?.searchBrowserFallbackToBing ? (isZh ? '开启' : 'On') : (isZh ? '关闭' : 'Off')}
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-sm bella-kv leading-snug">
                    <span className="min-w-0 pr-1">{isZh ? '允许 web_search' : 'Enable web_search'}</span>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void setRuntimeOption({ enableWebSearch: !options?.enableWebSearch })}
                      className={`shrink-0 bella-toggle-btn bella-toggle-btn-compact ${options?.enableWebSearch ? 'is-active' : ''}`}
                    >
                      {options?.enableWebSearch ? (isZh ? '开启' : 'On') : (isZh ? '关闭' : 'Off')}
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-sm bella-kv leading-snug">
                    <span className="min-w-0 pr-1">{isZh ? '允许 web_fetch' : 'Enable web_fetch'}</span>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void setRuntimeOption({ enableWebFetch: !options?.enableWebFetch })}
                      className={`shrink-0 bella-toggle-btn bella-toggle-btn-compact ${options?.enableWebFetch ? 'is-active' : ''}`}
                    >
                      {options?.enableWebFetch ? (isZh ? '开启' : 'On') : (isZh ? '关闭' : 'Off')}
                    </button>
                  </div>
                  <div className="pt-1">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void resetRuntimeOptions()}
                      className="bella-copy-btn"
                    >
                      {isZh ? '恢复默认' : 'Reset to defaults'}
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm bella-label">
              {isZh ? '无法加载配置，请确认后端已启动' : 'Failed to load config. Ensure backend is running.'}
            </p>
          )}
        </div>
        </div>
      </div>
    </div>

    {companionOpen && (
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4"
        onClick={() => setCompanionOpen(false)}
        role="presentation"
      >
        <div
          className="w-full max-w-md max-h-[min(90vh,36rem)] overflow-y-auto rounded-2xl bg-zinc-900 border border-white/10 p-4 text-sm text-white shadow-xl space-y-3"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="companion-memory-panel-title"
        >
          <div className="flex items-start justify-between gap-2">
            <h3 id="companion-memory-panel-title" className="font-medium pr-6">
              {isZh ? '伴侣记忆（gbrain）' : 'Companion memory (gbrain)'}
            </h3>
            <button
              type="button"
              className="shrink-0 rounded-lg px-2 py-0.5 text-lg leading-none text-white/60 hover:text-white hover:bg-white/10"
              onClick={() => setCompanionOpen(false)}
              aria-label={isZh ? '关闭' : 'Close'}
            >
              ×
            </button>
          </div>

          {authLoading && !user ? (
            <p className="text-xs text-white/55 py-2">{isZh ? '正在检查登录状态…' : 'Checking sign-in…'}</p>
          ) : user ? (
            <>
              <p className="text-xs text-white/70">
                {isZh ? '已登录：' : 'Signed in:'}{' '}
                <span className="font-medium text-white">{user.username}</span>
              </p>
              <p className="text-xs text-white/55">
                {isZh
                  ? '需服务端已安装 gbrain、执行 init，并设置 GBRAIN_ENABLED=1；写入在后台异步执行。'
                  : 'Requires gbrain CLI + init and GBRAIN_ENABLED=1 on the server; writes are asynchronous.'}
              </p>
              <button
                type="button"
                className="w-full rounded-lg border border-sky-400/40 bg-sky-500/15 text-sky-100 text-xs py-2 hover:bg-sky-500/25"
                onClick={() =>
                  window.open(`${window.location.origin}/bella/memory`, '_blank', 'noopener,noreferrer')
                }
              >
                {isZh ? '查看记忆' : 'View memory'}
              </button>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!settings?.companionMemoryEnabled}
                  onChange={async (e) => {
                    const v = e.target.checked;
                    try {
                      await updateSettings({ companionMemoryEnabled: v });
                    } catch {
                      // settings unchanged on server
                    }
                  }}
                />
                <span>{isZh ? '伴侣记忆总开关（读 gbrain + 允许写入时间线）' : 'Companion memory (read gbrain + timeline writes)'}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!settings?.autoLearnEnabled}
                  onChange={async (e) => {
                    const v = e.target.checked;
                    try {
                      await updateSettings({ autoLearnEnabled: v });
                    } catch {
                      // ignore
                    }
                  }}
                />
                <span>{isZh ? '自动学习（启发式写入，后台）' : 'Auto-learn (heuristic writes, background)'}</span>
              </label>
              <p className="text-[11px] text-white/45">
                {isZh
                  ? '显式「记住…」类语句在开启记忆总开关后也会写入时间线。'
                  : 'Explicit “remember …” phrases are written when companion memory is on.'}
              </p>
              <div className="rounded-lg bg-black/30 border border-white/10 p-2 flex items-center gap-2 min-w-0">
                <code className="text-[10px] text-white/80 truncate flex-1 font-mono">{user.id}</code>
                <button
                  type="button"
                  className="flex-shrink-0 rounded px-2 py-1 text-[11px] bg-white/15 hover:bg-white/25"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(user.id);
                      setCopiedUserId(true);
                      window.setTimeout(() => setCopiedUserId(false), 1600);
                    } catch {
                      // ignore
                    }
                  }}
                >
                  {copiedUserId ? (isZh ? '已复制' : 'Copied') : isZh ? '复制 UUID' : 'Copy UUID'}
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-white/65 leading-relaxed">
                {isZh
                  ? '请先使用页面右上角带边框的「登录 / 注册」登录（与这里共用会话）。也可点下面按钮直接打开登录框。'
                  : 'Sign in with the outlined button at the top-right (same session). Or open the form below.'}
              </p>
              <button
                type="button"
                className="w-full rounded-lg border border-white/20 bg-white/10 text-sm py-2 text-white hover:bg-white/15"
                onClick={() => {
                  openAuthModal();
                  setCompanionOpen(false);
                }}
              >
                {isZh ? '打开登录 / 注册' : 'Open sign in / register'}
              </button>
            </div>
          )}

          <button
            type="button"
            className="w-full rounded-lg bg-white/10 py-2 hover:bg-white/15"
            onClick={() => setCompanionOpen(false)}
          >
            {isZh ? '关闭' : 'Close'}
          </button>
        </div>
      </div>
    )}

    {pendingSwitchTarget && (
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4"
        onClick={() => setPendingSwitchTarget(null)}
        role="presentation"
      >
        <div
          className="w-full max-w-md rounded-2xl bg-zinc-900 border border-white/10 p-4 text-sm text-white shadow-xl space-y-3"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="framework-switch-confirm-title"
        >
          <h3 id="framework-switch-confirm-title" className="font-medium">
            {isZh ? '确认切换框架' : 'Confirm framework switch'}
          </h3>
          <p className="text-xs text-white/75 leading-relaxed">
            {isZh
              ? `将从 ${frameworkConfig?.framework || 'unknown'} 切换到 ${pendingSwitchTarget}。模式：${switchMode}。`
              : `Switch from ${frameworkConfig?.framework || 'unknown'} to ${pendingSwitchTarget}. Mode: ${switchMode}.`}
          </p>
          {switchMode === 'full_migrate' ? (
            <div className="space-y-1">
              <p className="text-xs text-amber-200 leading-relaxed">
                {isZh
                  ? '将执行完整迁移（可能涉及 SOUL/记忆/skills/配置同步），耗时可能更长。'
                  : 'Full migration will run (SOUL/memory/skills/config sync may apply) and can take longer.'}
              </p>
              {migrateSecrets ? (
                <p className="text-xs text-rose-200 leading-relaxed">
                  {isZh
                    ? '当前已启用密钥迁移（migrateSecrets=true）：将从本机 OpenClaw 配置/环境中迁移可识别的 provider key 值；UI 不会展示明文密钥。'
                    : 'Secrets migration is enabled (migrateSecrets=true): recognized provider key values are copied from local OpenClaw config/env; raw keys are not shown in the UI.'}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-white/60 leading-relaxed">
              {isZh
                ? '当前是 runtime_only，仅切换运行时与上下文，不做完整迁移。'
                : 'Current mode is runtime_only: runtime + context only, no full migration.'}
            </p>
          )}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              className="flex-1 rounded-lg bg-white/10 py-2 hover:bg-white/15"
              onClick={() => setPendingSwitchTarget(null)}
            >
              {isZh ? '取消' : 'Cancel'}
            </button>
            <button
              type="button"
              className="flex-1 rounded-lg bg-amber-500/90 text-black font-medium py-2 hover:bg-amber-400"
              onClick={() => {
                const target = pendingSwitchTarget;
                setPendingSwitchTarget(null);
                if (target) void executeSwitchFramework(target);
              }}
            >
              {isZh ? '确认切换' : 'Confirm switch'}
            </button>
          </div>
        </div>
      </div>
    )}

    </>
  );
}
