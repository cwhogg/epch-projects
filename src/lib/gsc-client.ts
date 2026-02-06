import { searchconsole_v1, auth as googleAuth } from '@googleapis/searchconsole';
import { GSCDateRow, GSCQueryRow } from '@/types';

const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

let authClient: InstanceType<typeof googleAuth.JWT> | null = null;

export function isGSCConfigured(): boolean {
  return !!(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
    (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY)
  );
}

function getAuthClient(): InstanceType<typeof googleAuth.JWT> {
  if (authClient) return authClient;

  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const decoded = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_JSON, 'base64').toString('utf-8');
    const credentials = JSON.parse(decoded);
    authClient = new googleAuth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: [SCOPE],
    });
  } else if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    authClient = new googleAuth.JWT({
      email: process.env.GOOGLE_CLIENT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: [SCOPE],
    });
  } else {
    throw new Error('GSC not configured: set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY');
  }

  return authClient;
}

function getClient(): searchconsole_v1.Searchconsole {
  const auth = getAuthClient();
  return new searchconsole_v1.Searchconsole({ auth });
}

export async function listGSCProperties(): Promise<{ siteUrl: string; permissionLevel: string }[]> {
  const client = getClient();
  const res = await client.sites.list();
  const entries = res.data.siteEntry || [];
  return entries
    .filter((e) => e.siteUrl && e.permissionLevel)
    .map((e) => ({
      siteUrl: e.siteUrl!,
      permissionLevel: e.permissionLevel!,
    }));
}

export async function fetchSearchAnalytics(
  siteUrl: string,
  startDate: string,
  endDate: string,
  dimensions: string[],
  rowLimit: number,
): Promise<GSCQueryRow[] | GSCDateRow[]> {
  const client = getClient();

  const res = await client.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions,
      rowLimit,
    },
  });

  const rows = res.data.rows || [];

  if (dimensions.includes('date')) {
    return rows.map((row) => ({
      date: row.keys![0],
      clicks: row.clicks ?? 0,
      impressions: row.impressions ?? 0,
      ctr: row.ctr ?? 0,
      position: row.position ?? 0,
    })) as GSCDateRow[];
  }

  if (dimensions.includes('query') && dimensions.includes('page')) {
    return rows.map((row) => ({
      query: row.keys![dimensions.indexOf('query')],
      page: row.keys![dimensions.indexOf('page')],
      clicks: row.clicks ?? 0,
      impressions: row.impressions ?? 0,
      ctr: row.ctr ?? 0,
      position: row.position ?? 0,
    })) as GSCQueryRow[];
  }

  if (dimensions.includes('query')) {
    return rows.map((row) => ({
      query: row.keys![0],
      clicks: row.clicks ?? 0,
      impressions: row.impressions ?? 0,
      ctr: row.ctr ?? 0,
      position: row.position ?? 0,
    })) as GSCQueryRow[];
  }

  // page dimension
  return rows.map((row) => ({
    query: row.keys![0],
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    position: row.position ?? 0,
  })) as GSCQueryRow[];
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export async function fetchFullAnalytics(
  siteUrl: string,
  daysBack = 90,
): Promise<{ timeSeries: GSCDateRow[]; queryData: GSCQueryRow[]; pageData: GSCQueryRow[] }> {
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 3); // GSC data has 2-3 day delay
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - daysBack);

  const startStr = formatDate(startDate);
  const endStr = formatDate(endDate);

  const [timeSeries, queryData, pageData] = await Promise.all([
    fetchSearchAnalytics(siteUrl, startStr, endStr, ['date'], 1000) as Promise<GSCDateRow[]>,
    fetchSearchAnalytics(siteUrl, startStr, endStr, ['query'], 500) as Promise<GSCQueryRow[]>,
    fetchSearchAnalytics(siteUrl, startStr, endStr, ['page'], 100) as Promise<GSCQueryRow[]>,
  ]);

  return { timeSeries, queryData, pageData };
}
