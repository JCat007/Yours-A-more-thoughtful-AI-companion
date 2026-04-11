import { getUserSettings } from './authService';
import { retrieveCompanionBrainContext } from './companionBrainContext';
import { isGbrainEnabled } from './gbrainCli';
import {
  isAutoPreferenceHint,
  isExplicitRememberRequest,
  scheduleCompanionMemoryAfterTurn,
} from './companionMemoryQueue';

export async function loadCompanionMemoryContext(args: {
  userId: string | null | undefined;
  mode: 'china' | 'world';
  userMessage: string;
}): Promise<string | undefined> {
  const userId = args.userId;
  if (!userId || !isGbrainEnabled()) return undefined;
  try {
    const settings = await getUserSettings(userId);
    if (!settings.companionMemoryEnabled) return undefined;
    const r = await retrieveCompanionBrainContext({
      userId,
      mode: args.mode,
      userMessage: args.userMessage,
    });
    if (!r?.text?.trim()) return undefined;
    return r.text.trim();
  } catch (e) {
    console.warn('[companion-context]', (e as Error)?.message || e);
    return undefined;
  }
}

function wantsCompanionMemoryWrite(userText: string, autoLearnEnabled: boolean): boolean {
  if (isExplicitRememberRequest(userText)) return true;
  return autoLearnEnabled && isAutoPreferenceHint(userText);
}

export async function maybeScheduleCompanionMemoryWrite(args: {
  userId: string | null | undefined;
  userText: string;
  assistantText: string;
}): Promise<void> {
  const userId = args.userId;
  const preview = args.userText.replace(/\s+/g, ' ').trim().slice(0, 120);

  if (!isGbrainEnabled()) {
    if (isExplicitRememberRequest(args.userText) || isAutoPreferenceHint(args.userText)) {
      console.info('[companion-memory-schedule] skip: GBRAIN_ENABLED off preview=%j', preview);
    }
    return;
  }
  if (!userId) {
    if (isExplicitRememberRequest(args.userText) || isAutoPreferenceHint(args.userText)) {
      console.info(
        '[companion-memory-schedule] skip: no req.bellaUser (chat without bella_session cookie?) preview=%j',
        preview,
      );
    }
    return;
  }
  try {
    const s = await getUserSettings(userId);
    if (!s.companionMemoryEnabled) {
      if (wantsCompanionMemoryWrite(args.userText, s.autoLearnEnabled)) {
        console.info(
          '[companion-memory-schedule] skip: companionMemoryEnabled=false userId=%s preview=%j',
          userId,
          preview,
        );
      }
      return;
    }
    const explicit = isExplicitRememberRequest(args.userText);
    if (explicit) {
      console.info('[companion-memory-schedule] queue explicit userId=%s preview=%j', userId, preview);
      scheduleCompanionMemoryAfterTurn({
        userId,
        userText: args.userText,
        assistantText: args.assistantText,
      });
      return;
    }
    if (s.autoLearnEnabled && isAutoPreferenceHint(args.userText)) {
      console.info('[companion-memory-schedule] queue auto-learn userId=%s preview=%j', userId, preview);
      scheduleCompanionMemoryAfterTurn({
        userId,
        userText: args.userText,
        assistantText: args.assistantText,
      });
      return;
    }
  } catch (e) {
    console.warn('[companion-memory-schedule]', (e as Error)?.message || e);
  }
}
