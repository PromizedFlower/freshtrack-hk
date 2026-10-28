const api = require('../../utils/api');

Page({
  data: { loading: true, kpi: null, trend: [], hasData: false },

  onShow() {
    if (!api.getSession().access_token) { wx.redirectTo({ url: '/pages/login/login' }); return; }
    this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const hid = await this._hid();
      const [kpi, trend] = await Promise.all([
        api.rpc('get_household_kpi', { p_household: hid }),
        api.rpc('get_household_trend', { p_household: hid }),
      ]);
      const maxKg = Math.max(1, ...trend.map((t) => t.saved_kg || 0));
      const withPct = trend.map((t) => ({ ...t, pct: Math.round((t.saved_kg / maxKg) * 100) }));
      this.setData({ loading: false, hasData: true, kpi, trend: withPct });
    } catch (e) {
      console.error('impact load failed', e);
      this.setData({ loading: false, hasData: false });
    }
  },

  async _hid() {
    let hid = getApp().globalData.householdId;
    if (!hid) {
      const hs = await api.rest('GET', 'households', { query: '?select=id&limit=1' });
      hid = hs && hs.length ? hs[0].id : null;
      getApp().globalData.householdId = hid;
    }
    return hid;
  },
});
