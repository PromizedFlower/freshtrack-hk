const api = require('../../utils/api');

Page({
  data: { loading: true, recipes: [], items: [], hasData: false, expandedId: null },

  onShow() {
    if (!api.getSession().access_token) { wx.redirectTo({ url: '/pages/login/login' }); return; }
    this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const hid = await this._hid();
      const [res, items] = await Promise.all([
        api.invoke('match-recipes', { household_id: hid, use_ai_fallback: true }),
        api.rest('GET', 'v_fridge_items_with_risk', { query: '?select=id,name&order=days_left.asc' }),
      ]);
      this.setData({ loading: false, hasData: true, recipes: (res && res.recipes) || [], items });
    } catch (e) {
      console.error('recipes load failed', e);
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

  toggle(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ expandedId: this.data.expandedId === id ? null : id });
  },

  norm(s) { return (s || '').toLowerCase().trim(); },

  matchIds(recipe) {
    const ings = recipe.ingredients || [];
    const ids = [];
    for (const ing of ings) {
      const n = this.norm(ing.name);
      const it = this.data.items.find((i) => {
        const m = this.norm(i.name);
        return n && (n === m || n.includes(m) || m.includes(n));
      });
      if (it && ids.indexOf(it.id) < 0) ids.push(it.id);
    }
    return ids;
  },

  cook(e) {
    const recipe = this.data.recipes.find((r) => r.id === e.currentTarget.dataset.id);
    if (!recipe) return;
    const ids = this.matchIds(recipe);
    if (!ids.length) {
      wx.showToast({ title: '没有匹配的可核销食材', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '开始下厨',
      content: `将核销 ${ids.length} 项食材并计入惜食减废。`,
      success: async (r) => {
        if (!r.confirm) return;
        wx.showLoading({ title: '处理中' });
        try {
          const hid = await this._hid();
          await api.rpc('consume_for_recipe', { p_household: hid, p_recipe: recipe.id, p_item_ids: ids });
          wx.hideLoading();
          wx.showToast({ title: '已完成', icon: 'success' });
          this.load();
        } catch (err) {
          wx.hideLoading();
          wx.showToast({ title: '操作失败', icon: 'none' });
        }
      },
    });
  },
});
