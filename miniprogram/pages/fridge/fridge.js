const api = require('../../utils/api');

Page({
  data: { loading: true, items: [], hasData: false },

  onShow() {
    if (!api.getSession().access_token) { wx.redirectTo({ url: '/pages/login/login' }); return; }
    this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const hid = await this._hid();
      const items = await api.rest('GET', 'v_fridge_items_with_risk', {
        query: '?select=id,name,category,quantity,unit,days_left,date_type,expiry_date,risk_level,suggested_action,weight_grams&order=days_left.asc',
      });
      this.setData({ loading: false, hasData: true, items });
    } catch (e) {
      console.error('fridge load failed', e);
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

  consume(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.showModal({
      title: '标记已用',
      content: `确认「${name}」已用完 / 已下厨？将计入惜食减废。`,
      success: async (r) => {
        if (!r.confirm) return;
        wx.showLoading({ title: '处理中' });
        try {
          const hid = await this._hid();
          await api.rpc('consume_direct', { p_household: hid, p_item_ids: [id] });
          wx.hideLoading();
          wx.showToast({ title: '已核销', icon: 'success' });
          this.load();
        } catch (err) {
          wx.hideLoading();
          wx.showToast({ title: '操作失败', icon: 'none' });
        }
      },
    });
  },

  remove(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.showModal({
      title: '删除',
      content: `确认从冰箱移除「${name}」？`,
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await api.rest('DELETE', 'fridge_items', { query: `?id=eq.${id}` });
          this.load();
        } catch (err) {
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      },
    });
  },

  goAdd() { wx.switchTab({ url: '/pages/add/add' }); },
});
