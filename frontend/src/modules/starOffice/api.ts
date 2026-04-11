import client from '../../api/client';

export interface StarOfficeConfigResponse {
  module: 'starOffice';
  enabled: boolean;
  officeBaseUrl: string;
  embeddedPath: string;
  panels: Array<'memo' | 'guest' | 'status' | 'assets' | 'coords'>;
}

export async function fetchStarOfficeConfig(): Promise<StarOfficeConfigResponse> {
  const res = await client.get<StarOfficeConfigResponse>('/star-office/config');
  return res.data;
}
