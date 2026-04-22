import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ModeModal from './ModeModal';
import type { AssistantConfig, AssistantFrameworkConfig, FrameworkSwitchResponse } from '../../api/assistant';

const assistantApiMock = vi.hoisted(() => ({
  getConfig: vi.fn(),
  getFrameworkConfig: vi.fn(),
  switchFramework: vi.fn(),
  updateRuntimeOptions: vi.fn(),
  resetRuntimeOptions: vi.fn(),
}));

const useModeMock = vi.hoisted(() =>
  vi.fn(() => ({
    mode: 'world' as const,
    setMode: vi.fn(),
  }))
);

const useBellaAuthMock = vi.hoisted(() =>
  vi.fn(() => ({
    user: null,
    settings: null,
    loading: false,
    refresh: vi.fn(async () => undefined),
    updateSettings: vi.fn(async () => undefined),
    openAuthModal: vi.fn(),
  }))
);

vi.mock('../../api/assistant', () => ({
  assistantApi: assistantApiMock,
}));

vi.mock('../../contexts/ModeContext', () => ({
  useMode: useModeMock,
}));

vi.mock('../../contexts/BellaAuthContext', () => ({
  useBellaAuth: useBellaAuthMock,
}));

const baseConfig: AssistantConfig = {
  mode: 'world',
  model: 'test-model',
  skills: [{ id: 's1', name: 'Skill One', summary: 'summary' }],
  runtimeOptions: {
    searchBrowserFallbackToBing: false,
    enableWebSearch: true,
    enableWebFetch: true,
  },
};

const baseFrameworkConfig: AssistantFrameworkConfig = {
  framework: 'openclaw',
  contextStrategyDefault: 'last_20_turns',
  availableFrameworks: ['openclaw', 'hermes'],
  availableContextStrategies: ['last_20_turns', 'full_with_summary'],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('ModeModal framework switching states', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    assistantApiMock.getConfig.mockResolvedValue(baseConfig);
    assistantApiMock.getFrameworkConfig.mockResolvedValue(baseFrameworkConfig);
  });

  it('shows checking/migrating/completed states on success', async () => {
    const inflight = deferred<FrameworkSwitchResponse>();
    assistantApiMock.switchFramework.mockReturnValue(inflight.promise);
    assistantApiMock.getFrameworkConfig
      .mockResolvedValueOnce(baseFrameworkConfig)
      .mockResolvedValueOnce({ ...baseFrameworkConfig, framework: 'hermes' });

    render(<ModeModal open={true} onClose={() => undefined} />);

    const hermesButton = await screen.findByRole('button', { name: 'Hermes' });
    await userEvent.click(hermesButton);

    // checking_idle is a short-lived transitional state; migrating is the stable in-flight marker.
    await screen.findByText(/Migrating context/i);

    inflight.resolve({
      ok: true,
      framework: 'hermes',
      switchMode: 'full_migrate',
      contextStrategy: 'last_20_turns',
      migration: { strategy: 'last_20_turns', turnsMigrated: 24, summaryIncluded: false },
      observability: { pendingBackgroundWrites: 0, gbrainRuntimeStable: true },
    });

    await screen.findByText(/Switch completed \(24 turns migrated\)/i);
    await waitFor(() => expect(assistantApiMock.getFrameworkConfig).toHaveBeenCalledTimes(2));
  });

  it('shows blocked reason when switch is not idle', async () => {
    assistantApiMock.getFrameworkConfig.mockResolvedValue(baseFrameworkConfig);
    assistantApiMock.switchFramework.mockResolvedValue({
      ok: false,
      code: 'SWITCH_BLOCKED_NOT_IDLE',
      message: 'Current task is still running.',
      blocking: { activeJobs: 2 },
    });

    render(<ModeModal open={true} onClose={() => undefined} />);
    await screen.findByText('openclaw');
    const hermesButton = await screen.findByRole('button', { name: 'Hermes' });
    await userEvent.click(hermesButton);

    await waitFor(() =>
      expect(assistantApiMock.switchFramework).toHaveBeenCalledWith('hermes', 'last_20_turns', {
        switchMode: 'full_migrate',
        migrateSecrets: true,
        workspaceTarget: undefined,
      })
    );
    await screen.findByText(/Current task is still running/i);
    await screen.findByText(/activeJobs=2,\s*inFlight=0/i);
  });

  it('shows failed status when API throws', async () => {
    assistantApiMock.switchFramework.mockRejectedValue(new Error('boom'));

    render(<ModeModal open={true} onClose={() => undefined} />);
    const hermesButton = await screen.findByRole('button', { name: 'Hermes' });
    await userEvent.click(hermesButton);

    await screen.findByText(/Failed to switch framework\. Please retry\./i);
  });

  it('prevents duplicate switch requests while one is in flight', async () => {
    const inflight = deferred<FrameworkSwitchResponse>();
    assistantApiMock.switchFramework.mockReturnValue(inflight.promise);

    render(<ModeModal open={true} onClose={() => undefined} />);
    const hermesButton = await screen.findByRole('button', { name: 'Hermes' });

    await userEvent.click(hermesButton);
    await userEvent.click(hermesButton);

    await waitFor(() => expect(assistantApiMock.switchFramework).toHaveBeenCalledTimes(1));

    inflight.resolve({
      ok: true,
      framework: 'hermes',
      switchMode: 'full_migrate',
      contextStrategy: 'last_20_turns',
      migration: { strategy: 'last_20_turns', turnsMigrated: 24, summaryIncluded: false },
      observability: { pendingBackgroundWrites: 0, gbrainRuntimeStable: true },
    });

    await screen.findByText(/Switch completed \(24 turns migrated\)/i);
  });
});
