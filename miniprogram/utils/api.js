// FreshTrack HK — thin Supabase client over wx.request (no external SDK needed).
const config = require('./config');

function request(method, url, { body, headers = {}, auth = true } = {}) {
  const h = Object.assign({ 'Content-Type': 'application/json', apikey: config.ANON_KEY }, headers);
  const token = wx.getStorageSync('ft_access_token');
  if (auth && token) h.Authorization = 'Bearer ' + token;
  return new Promise((resolve, reject) => {
    wx.request({
      url, method, data: body, header: h,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
        else reject({ status: res.statusCode, data: res.data });
      },
      fail(err) { reject(err); },
    });
  });
}

// PostgREST table access.
function rest(method, table, { query = '', body, auth = true } = {}) {
  return request(method, `${config.SUPABASE_URL}/rest/v1/${table}${query}`, { body, auth });
}

// Postgres function call (RPC). Params keyed by the function's argument names.
function rpc(fn, params, auth = true) {
  return request('POST', `${config.SUPABASE_URL}/rest/v1/rpc/${fn}`, { body: params, auth });
}

// Edge Function call.
function invoke(fn, body, auth = true) {
  return request('POST', `${config.FUNCTIONS_BASE}/${fn}`, { body, auth });
}

// Auth: password grant (email + password).
function signIn(email, password) {
  return request('POST', `${config.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    body: { email, password }, auth: false,
  });
}

function signUp(email, password) {
  return request('POST', `${config.SUPABASE_URL}/auth/v1/signup`, {
    body: { email, password }, auth: false,
  });
}

function setSession(tokens) {
  wx.setStorageSync('ft_access_token', tokens.access_token);
  wx.setStorageSync('ft_refresh_token', tokens.refresh_token);
  wx.setStorageSync('ft_user', tokens.user);
}

function clearSession() {
  wx.removeStorageSync('ft_access_token');
  wx.removeStorageSync('ft_refresh_token');
  wx.removeStorageSync('ft_user');
}

function getSession() {
  return {
    access_token: wx.getStorageSync('ft_access_token'),
    user: wx.getStorageSync('ft_user'),
  };
}

module.exports = { request, rest, rpc, invoke, signIn, signUp, setSession, clearSession, getSession, config };
