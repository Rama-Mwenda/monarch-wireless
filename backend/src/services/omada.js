const axios = require('axios');
const https = require('https');

const client = axios.create({
  httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  timeout: 10000,
});

let tokenCache     = null;
let tokenExpiry    = 0;
let omadacIdCache  = null;
let siteCache      = null;

// ── Hotspot operator session (Web API v2 — separate from OpenAPI) ──
let hotspotSession = null;  // { cookie, csrfToken, expiry }

const BASE          = process.env.OMADA_URL;
const CLIENT_ID     = process.env.OMADA_CLIENT_ID;
const CLIENT_SECRET = process.env.OMADA_CLIENT_SECRET;
const OPERATOR_USER = process.env.OMADA_OPERATOR_USER;
const OPERATOR_PASS = process.env.OMADA_OPERATOR_PASS;

// ── OpenAPI helpers ──────────────────────────────────────────

async function getControllerId() {
  if (omadacIdCache) return omadacIdCache;
  const res = await client.get(`${BASE}/api/info`);
  const id = res.data.result?.omadacId;
  if (!id) throw new Error('Could not get Omada controller ID');
  omadacIdCache = id;
  return id;
}

async function obtainNewToken(omadacId) {
  const url = `${BASE}/openapi/authorize/token?grant_type=client_credentials`;
  const res = await client.post(url,
    { omadacId, client_id: CLIENT_ID, client_secret: CLIENT_SECRET },
    { headers: { 'Content-Type': 'application/json' } }
  );
  if (res.data?.errorCode !== 0) throw new Error(`Token failed: ${res.data?.msg}`);
  const r = res.data.result || {};
  tokenCache  = r.accessToken;
  tokenExpiry = Date.now() + (r.expiresIn || 7200) * 1000;
  return tokenCache;
}

async function getToken() {
  if (tokenCache && Date.now() < tokenExpiry - 60000) return tokenCache;
  const omadacId = await getControllerId();
  return obtainNewToken(omadacId);
}

async function getSiteId(omadacId, token) {
  if (siteCache) return siteCache;
  const res = await client.get(
    `${BASE}/openapi/v1/${omadacId}/sites?pageSize=100&page=1`,
    { headers: { Authorization: `AccessToken=${token}` } }
  );
  if (res.data.errorCode !== 0) {
    // Clear caches so next call retries fresh
    tokenCache    = null;
    omadacIdCache = null;
    throw new Error(`Failed to get sites: ${res.data.msg}`);
  }
  const sites    = res.data.result?.data || [];
  const siteName = process.env.OMADA_SITE_NAME || '';
  const site     = sites.find(s => s.name.toLowerCase() === siteName.toLowerCase()) || sites[0];
  if (!site) throw new Error('No sites found in Omada controller');
  siteCache = { siteId: site.siteId || site.id, siteName: site.name };
  return siteCache;
}

// Call this to force a full re-auth on next request
function clearCache() {
  tokenCache    = null;
  tokenExpiry   = 0;
  omadacIdCache = null;
  siteCache     = null;
  hotspotSession = null;
}

// ── Hotspot Web API v2 session ───────────────────────────────
// Used for extPortal/auth — requires a hotspot operator account
// (not the same as the admin/OpenAPI credentials)

async function getHotspotSession(omadacId) {
  // Return cached session if still valid (1h)
  if (hotspotSession && Date.now() < hotspotSession.expiry) return hotspotSession;

  if (!OPERATOR_USER || !OPERATOR_PASS) {
    throw new Error('OMADA_OPERATOR_USER / OMADA_OPERATOR_PASS not set in .env');
  }

  const loginUrl = `${BASE}/${omadacId}/api/v2/hotspot/login`;
  const res = await client.post(loginUrl, {
    name:     OPERATOR_USER,
    password: OPERATOR_PASS,
  }, {
    withCredentials: true,
  });

  if (res.data?.errorCode !== 0) {
    throw new Error(`Hotspot login failed: ${res.data?.msg}`);
  }

  // Extract session cookie
  const setCookie = res.headers['set-cookie'] || [];
  const cookieName = setCookie.some(c => c.includes('TPOMADA_SESSIONID'))
    ? 'TPOMADA_SESSIONID'
    : 'TPEAP_SESSIONID';
  const cookieHeader = setCookie.map(c => c.split(';')[0]).join('; ');
  const csrfToken = res.data.result?.token;

  hotspotSession = {
    cookie:    cookieHeader,
    cookieName,
    csrfToken,
    expiry:    Date.now() + 55 * 60 * 1000, // 55 min
  };

  console.log('🔑 Omada hotspot session obtained');
  return hotspotSession;
}

// ── MAC Authorization (OpenAPI v1) ───────────────────────────
// Uses OpenAPI token — authorizes a MAC via the newer endpoint
// Available in Omada controller 5.x with OpenAPI enabled

async function authorizeClientOpenAPI(clientMac, durationMinutes) {
  const omadacId   = await getControllerId();
  const token      = await getToken();
  const { siteId } = await getSiteId(omadacId, token);

  const mac = normaliseMac(clientMac);
  const url = `${BASE}/openapi/v1/${omadacId}/sites/${siteId}/hotspot/clients/${mac}/auth`;

  const res = await client.post(url, {
    duration: durationMinutes * 60, // seconds
  }, {
    headers: {
      Authorization:  `AccessToken=${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (res.data?.errorCode !== 0) {
    throw new Error(`OpenAPI MAC auth failed: ${res.data?.msg}`);
  }

  console.log(`✅ Omada OpenAPI: authorized ${mac} for ${durationMinutes}min`);
  return { success: true, method: 'openapi' };
}

// ── MAC Authorization (Web API v2 extPortal) ─────────────────
// Used when Omada is configured as External Portal
// Requires: hotspot operator account + all params from the redirect URL

async function authorizeClientExtPortal({
  clientMac, apMac, ssidName, radioId, site, durationMinutes,
}) {
  const omadacId = await getControllerId();
  const session  = await getHotspotSession(omadacId);

  const mac     = normaliseMac(clientMac);
  const authUrl = `${BASE}/${omadacId}/api/v2/hotspot/extPortal/auth`;

  const payload = {
    clientMac: mac,
    ap:        apMac        || '',
    ssid:      ssidName     || process.env.OMADA_SSID || '',
    radioId:   radioId      || 0,
    site:      site         || process.env.OMADA_SITE_NAME || '',
    time:      durationMinutes * 60, // seconds
    t:         Math.floor(Date.now() / 1000),
  };

  const res = await client.post(authUrl, payload, {
    headers: {
      Cookie:          session.cookie,
      'Csrf-Token':    session.csrfToken,
      'Content-Type':  'application/json',
    },
  });

  if (res.data?.errorCode !== 0) {
    throw new Error(`extPortal auth failed: ${res.data?.msg}`);
  }

  console.log(`✅ Omada extPortal: authorized ${mac} for ${durationMinutes}min`);
  return { success: true, method: 'extportal' };
}

// ── MAC Deauthorization ──────────────────────────────────────
async function deauthorizeClient(clientMac) {
  try {
    const omadacId   = await getControllerId();
    const token      = await getToken();
    const { siteId } = await getSiteId(omadacId, token);

    const mac = normaliseMac(clientMac);
    const url = `${BASE}/openapi/v1/${omadacId}/sites/${siteId}/hotspot/clients/${mac}/unauth`;

    const res = await client.post(url, {}, {
      headers: { Authorization: `AccessToken=${token}` },
    });

    const ok = res.data?.errorCode === 0;
    console.log(`${ok ? '✅' : '⚠️'} Omada: deauthorized ${mac}`);
    return { success: ok };
  } catch(e) {
    console.error('Deauth error:', e.message);
    return { success: false, error: e.message };
  }
}

// ── Main authorize function — tries OpenAPI first, falls back to extPortal ──
async function authorizeClient({ clientMac, apMac, ssidName, radioId, site, durationMinutes }) {
  if (!clientMac) {
    console.warn('⚠️  authorizeClient called with no MAC — skipping');
    return { success: false, skipped: true, reason: 'no_mac' };
  }

  if (process.env.OMADA_MOCK === 'true') {
    console.log(`[MOCK] Authorized ${clientMac} for ${durationMinutes}min`);
    return { success: true, method: 'mock' };
  }

  // Try OpenAPI first (cleaner, stateless)
  try {
    return await authorizeClientOpenAPI(clientMac, durationMinutes);
  } catch(e) {
    console.warn(`OpenAPI auth failed (${e.message}), trying extPortal...`);
  }

  // Fallback to Web API v2 extPortal
  try {
    return await authorizeClientExtPortal({ clientMac, apMac, ssidName, radioId, site, durationMinutes });
  } catch(e) {
    console.error(`extPortal auth also failed: ${e.message}`);
    return { success: false, error: e.message };
  }
}

// ── Helpers ──────────────────────────────────────────────────

function normaliseMac(mac) {
  // Omada accepts XX-XX-XX-XX-XX-XX or xx:xx:xx:xx:xx:xx
  return (mac || '').toLowerCase().replace(/-/g, ':');
}

function mapStatus(ap) {
  if (ap.status === 0) return 'offline';
  if (ap.status === 1) return 'online';
  return 'unknown';
}

function parseUptimeString(str) {
  if (!str || typeof str !== 'string') return 0;
  let seconds = 0;
  const days  = str.match(/(\d+)\s*d/);
  const hours = str.match(/(\d+)\s*h/);
  const mins  = str.match(/(\d+)\s*m/);
  const secs  = str.match(/(\d+)\s*s/);
  if (days)  seconds += parseInt(days[1])  * 86400;
  if (hours) seconds += parseInt(hours[1]) * 3600;
  if (mins)  seconds += parseInt(mins[1])  * 60;
  if (secs)  seconds += parseInt(secs[1]);
  return seconds;
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B','KB','MB','GB'];
  let i = 0, val = bytes;
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
  return `${val.toFixed(1)} ${units[i]}`;
}

function formatConnectTime(seconds) {
  if (!seconds) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ── Get all connected clients ────────────────────────────────
async function getClients(apMacFilter = null) {
  if (process.env.OMADA_MOCK === 'true') return getMockClients(apMacFilter);

  const omadacId   = await getControllerId();
  const token      = await getToken();
  const { siteId } = await getSiteId(omadacId, token);

  const res = await client.get(
    `${BASE}/openapi/v1/${omadacId}/sites/${siteId}/clients?pageSize=200&page=1`,
    { headers: { Authorization: `AccessToken=${token}` } }
  );

  if (res.data.errorCode !== 0) throw new Error(`Failed to get clients: ${res.data.msg}`);

  let clients = res.data.result?.data || [];
  if (apMacFilter) {
    const norm = apMacFilter.toUpperCase();
    clients = clients.filter(c =>
      (c.apMac || c.connectDevMac || '').toUpperCase() === norm
    );
  }

  return clients.map(c => ({
    mac:              c.mac || '—',
    name:             c.name || c.hostName || c.mac || 'Unknown',
    ip:               c.ip || '—',
    ap_mac:           c.apMac || c.connectDevMac || '—',
    ap_name:          c.apName || '—',
    ssid:             c.ssid || '—',
    band:             c.band ? `${c.band}GHz` : '—',
    signal:           c.rssi || c.signalLevel || null,
    tx_rate:          c.txRate || 0,
    rx_rate:          c.rxRate || 0,
    tx_bytes:         c.trafficDown || c.txBytes || 0,
    rx_bytes:         c.trafficUp   || c.rxBytes || 0,
    tx_bytes_fmt:     formatBytes(c.trafficDown || c.txBytes || 0),
    rx_bytes_fmt:     formatBytes(c.trafficUp   || c.rxBytes || 0),
    tx_rate_fmt:      c.txRate ? `${(c.txRate/1000).toFixed(1)} Mbps` : '—',
    rx_rate_fmt:      c.rxRate ? `${(c.rxRate/1000).toFixed(1)} Mbps` : '—',
    connected_since:  c.connectTime ? new Date(Date.now() - c.connectTime*1000).toISOString() : null,
    connect_time_str: formatConnectTime(c.connectTime),
    wireless:         c.wireless !== false,
    vendor:           c.vendor || '—',
  }));
}

async function getClientCountsByAP(omadacId, token, siteId) {
  const counts = {};
  try {
    const res = await client.get(
      `${BASE}/openapi/v1/${omadacId}/sites/${siteId}/clients?pageSize=200&page=1`,
      { headers: { Authorization: `AccessToken=${token}` } }
    );
    if (res.data.errorCode === 0) {
      const clients = res.data.result?.data || [];
      for (const c of clients) {
        const apMac = (c.apMac || c.connectDevMac || '').toUpperCase();
        if (apMac) counts[apMac] = (counts[apMac] || 0) + 1;
      }
    }
  } catch(err) { console.log('Client count fetch error:', err.message); }
  return counts;
}

async function getAccessPoints() {
  if (process.env.OMADA_MOCK === 'true') return getMockData();

  const omadacId   = await getControllerId();
  const token      = await getToken();
  const { siteId } = await getSiteId(omadacId, token);

  const [devRes, clientCounts] = await Promise.all([
    client.get(
      `${BASE}/openapi/v1/${omadacId}/sites/${siteId}/devices?pageSize=100&page=1`,
      { headers: { Authorization: `AccessToken=${token}` } }
    ),
    getClientCountsByAP(omadacId, token, siteId),
  ]);

  if (devRes.data.errorCode !== 0) throw new Error(`Failed to get devices: ${devRes.data.msg}`);

  const devices = devRes.data.result?.data || [];
  const aps = devices.filter(d => d.type === 'ap' || !d.type);

  return aps.map(ap => {
    const macNorm = (ap.mac || '').toUpperCase();
    return {
      id:                ap.mac,
      name:              ap.name !== ap.mac ? ap.name : (ap.modelName || ap.mac),
      mac:               ap.mac,
      model:             ap.modelName || ap.model || 'EAP610',
      status:            mapStatus(ap),
      ip:                ap.ip || ap.publicIp || '—',
      connected_clients: clientCounts[macNorm] || ap.clientNum || 0,
      uptime_seconds:    parseUptimeString(ap.uptime),
      uptime_str:        ap.uptime || '—',
      tx_bytes:          ap.txBytes || 0,
      rx_bytes:          ap.rxBytes || 0,
      cpu_usage:         ap.cpuUtil || 0,
      mem_usage:         ap.memUtil || 0,
      firmware:          ap.firmwareVersion || '—',
      channel_2g:        ap.channel2g || '—',
      channel_5g:        ap.channel5g || '—',
      last_seen:         ap.lastSeen ? new Date(ap.lastSeen).toISOString() : new Date().toISOString(),
    };
  });
}

async function getSiteStats() {
  if (process.env.OMADA_MOCK === 'true') {
    return { total_aps: 1, online_aps: 1, total_clients: 2, site_name: process.env.OMADA_SITE_NAME };
  }
  try {
    const aps = await getAccessPoints();
    return {
      total_aps:     aps.length,
      online_aps:    aps.filter(a => a.status === 'online').length,
      total_clients: aps.reduce((s, a) => s + a.connected_clients, 0),
      site_name:     process.env.OMADA_SITE_NAME,
    };
  } catch(e) {
    return { total_aps: 0, online_aps: 0, total_clients: 0, site_name: process.env.OMADA_SITE_NAME };
  }
}

function getMockClients() {
  return [
    { mac:'AA:BB:CC:11:22:33', name:"John's iPhone", ip:'192.168.0.110', ap_mac:'CC-BA-BD-51-CA-C0', ap_name:'EAP610-Outdoor', ssid:'Monarch Wireless', band:'5GHz', signal:-55, tx_rate:54000, rx_rate:36000, tx_bytes:1024*1024*12, rx_bytes:1024*1024*3, tx_bytes_fmt:'12.0 MB', rx_bytes_fmt:'3.0 MB', tx_rate_fmt:'54.0 Mbps', rx_rate_fmt:'36.0 Mbps', connect_time_str:'1h 23m', wireless:true, vendor:'Apple' },
    { mac:'DD:EE:FF:44:55:66', name:'Samsung Galaxy', ip:'192.168.0.111', ap_mac:'CC-BA-BD-51-CA-C0', ap_name:'EAP610-Outdoor', ssid:'Monarch Wireless', band:'5GHz', signal:-62, tx_rate:24000, rx_rate:18000, tx_bytes:1024*1024*5, rx_bytes:1024*1024*1, tx_bytes_fmt:'5.0 MB', rx_bytes_fmt:'1.0 MB', tx_rate_fmt:'24.0 Mbps', rx_rate_fmt:'18.0 Mbps', connect_time_str:'45m', wireless:true, vendor:'Samsung' },
  ];
}

function getMockData() {
  return [{ id:'mock-ap-001', name:'EAP610-Outdoor', mac:'CC-BA-BD-51-CA-C0', model:'EAP610-Outdoor', status:'online', ip:'192.168.0.106', connected_clients:2, uptime_seconds:54196, uptime_str:'15h 3m 16s', tx_bytes:0, rx_bytes:0, cpu_usage:2, mem_usage:68, firmware:'1.4.4 Build 20250718', channel_2g:'—', channel_5g:'36', last_seen:new Date().toISOString() }];
}

module.exports = {
  getAccessPoints, getSiteStats, getClients,
  authorizeClient, deauthorizeClient, normaliseMac, clearCache,
};