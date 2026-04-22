import client from './client';

export type BellaAuthUser = { id: string; username: string };

export type BellaUserSettings = {
  userId: string;
  companionMemoryEnabled: boolean;
  autoLearnEnabled: boolean;
};

export const authApi = {
  me: async () => {
    const res = await client.get<{ user: BellaAuthUser | null; settings: BellaUserSettings | null }>('/auth/me');
    return res.data;
  },
  login: async (username: string, password: string) => {
    const res = await client.post<{ user: BellaAuthUser; settings: BellaUserSettings }>('/auth/login', {
      username,
      password,
    });
    return res.data;
  },
  register: async (username: string, password: string) => {
    const res = await client.post<{ user: BellaAuthUser; settings: BellaUserSettings }>('/auth/register', {
      username,
      password,
    });
    return res.data;
  },
  logout: async () => {
    await client.post('/auth/logout');
  },
  updateSettings: async (patch: { companionMemoryEnabled?: boolean; autoLearnEnabled?: boolean }) => {
    const res = await client.patch<{ user: BellaAuthUser; settings: BellaUserSettings }>('/auth/me/settings', patch);
    return res.data;
  },
  getCompanionPreferences: async () => {
    const res = await client.get<{ slug: string; markdown: string }>('/auth/companion-preferences', {
      params: { _: Date.now() },
    });
    return res.data;
  },
  putCompanionPreferences: async (markdown: string) => {
    const res = await client.put<{ ok: boolean; slug: string }>('/auth/companion-preferences', { markdown });
    return res.data;
  },
};
