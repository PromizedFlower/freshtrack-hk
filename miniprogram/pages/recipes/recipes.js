const api = require('../../utils/api');

Page({
  data: {
    loading: true,
    recipes: [],
    items: [],
    hasData: false,
    expandedId: null,
    aiRecipes: [],
    aiDisclaimer: '',
    aiLoading: false,
    aiError: '',
    query: '',
  },

  onShow() {
    if (!api.getSession().access_token) { wx.redirectTo({ url: '/pages/login/login' }); return; }
    this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const hid = await this._hid();
      const [res, items] = await Promise.all([
        // 首屏 = 本地轻量匹配（也是离线兜底），不默认触发 AI。
        api.invoke('match-recipes', { household_id: hid }),
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

  // ---------- AI（主动触发主导） ----------
  onQueryInput(e) { this.setData({ query: e.detail.value }); },

  onAiTonight() { this._askAi(''); },

  onAsk() { this._askAi(this.data.query); },

  async _askAi(query) {
    if (this.data.aiLoading) return;
    this.setData({ aiLoading: true, aiError: '' });
    try {
      const hid = await this._hid();
      const res = await api.invoke('recipe-ai-chat', { household_id: hid, query: query || '', allergies: [], dietary: [] });
      const recipes = ((res && res.recipes) || []).map((r) => Object.assign({}, r, { _open: false }));
      this.setData({ aiLoading: false, aiRecipes: recipes, aiDisclaimer: (res && res.disclaimer) || '' });
      if (!recipes.length) wx.showToast({ title: '没有生成结果', icon: 'none' });
    } catch (e) {
      console.error('ai recipe failed', e);
      this.setData({ aiLoading: false, aiError: 'AI 生成失败，已回退本地菜谱' });
      wx.showToast({ title: 'AI 暂时不可用', icon: 'none' });
    }
  },

  toggleAi(e) {
    const idx = e.currentTarget.dataset.idx;
    this.setData({ ['aiRecipes[' + idx + ']._open']: !this.data.aiRecipes[idx]._open });
  },

  // 收藏：写回 recipes 表（source='ai'），受控走 SECURITY DEFINER RPC。
  save(e) {
    const r = this.data.aiRecipes[e.currentTarget.dataset.idx];
    if (!r) return;
    wx.showLoading({ title: '收藏中' });
    api.rpc('save_recipe', {
      p_title: r.title,
      p_prep_time_min: r.prep_time_min,
      p_difficulty: r.difficulty,
      p_servings: r.servings,
      p_ingredients: r.ingredients,
      p_steps: r.steps,
      p_tags: ['AI'],
      p_source: 'ai',
    }).then(() => {
      wx.hideLoading();
      wx.showToast({ title: '已收藏', icon: 'success' });
    }).catch((err) => {
      wx.hideLoading();
      console.error('save failed', err);
      wx.showToast({ title: '收藏失败', icon: 'none' });
    });
  },

  // AI 菜下厨：按勾选原料真实扣库存（D4），走 consume_direct。
  cookAi(e) {
    const r = this.data.aiRecipes[e.currentTarget.dataset.idx];
    if (!r) return;
    const ids = this.matchIds(r);
    if (!ids.length) {
      wx.showToast({ title: '没有匹配的可核销食材', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '开始下厨',
      content: `将核销 ${ids.length} 项食材并计入惜食减废。`,
      success: async (confirm) => {
        if (!confirm.confirm) return;
        wx.showLoading({ title: '处理中' });
        try {
          const hid = await this._hid();
          await api.rpc('consume_direct', { p_household: hid, p_item_ids: ids });
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

  // ---------- 本地菜下厨（既有逻辑） ----------
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
