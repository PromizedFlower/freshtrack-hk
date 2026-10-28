const api = require('../../utils/api');

Page({
  data: { loading: true, kpi: null, expiring: [], hasData: false },

  onShow() {
    if (!api.getSession().access_token) {
      wx.redirectTo({ url: '/pages/login/login' });
      return;
    }
    this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      let hid = getApp().globalData.householdId;
      if (!hid) {
        const hs = await api.rest('GET', 'households', { query: '?select=id,name&limit=1' });
        hid = hs && hs.length ? hs[0].id : null;
        getApp().globalData.householdId = hid;
      }
      if (!hid) { this.setData({ loading: false, hasData: false }); return; }

      const [kpi, expiring] = await Promise.all([
        api.rpc('get_household_kpi', { p_household: hid }),
        api.rest('GET', 'v_fridge_items_with_risk', {
          query: '?risk_level=eq.high&select=id,name,category,days_left,date_type,risk_level&order=days_left.asc&limit=5',
        }),
      ]);
      this.setData({ loading: false, hasData: true, kpi, expiring });
    } catch (e) {
      console.error('dashboard load failed', e);
      this.setData({ loading: false, hasData: false });
    }
  },

  goAdd() { wx.switchTab({ url: '/pages/add/add' }); },
  goRecipes() { wx.switchTab({ url: '/pages/recipes/recipes' }); },
  goFridge() { wx.switchTab({ url: '/pages/fridge/fridge' }); },
  goImpact() { wx.switchTab({ url: '/pages/impact/impact' }); },
});
