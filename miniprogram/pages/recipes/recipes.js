const api = require('../../utils/api');
const i18n = require('../../utils/i18n');

Page({
  data: {
    loading: true, hasData: false,
    lang: 'zh', theme: 'light', font: 'normal',
    mode: 'explore', // explore | chef
    recipes: [], items: [], expandedId: null,
    myRecipes: [], showRecord: false, recTitle: '', recNote: '',
    aiRecipes: [], aiDisclaimer: '', aiLoading: false, aiError: '', query: '',
    presets: [],
  },

  onLoad() {
    const app = getApp();
    this.setData({ lang: app.globalData.lang, theme: app.globalData.theme, font: app.globalData.font });
  },

  onShow() {
    if (!api.getSession().access_token) { wx.redirectTo({ url: '/pages/login/login' }); return; }
    if (this.getTabBar && this.getTabBar()) this.getTabBar().setData({ active: '/pages/recipes/recipes' });
    getApp().applyPrefs();
    this.setData(Object.assign({ lang: i18n.getLang(), theme: i18n.getTheme(), font: i18n.getFont() }, this._labels()));
    this.load();
  },

  _labels() {
    const t = i18n.t;
    return {
      tExplore: t('recipe_explore'), tChef: t('recipe_chef'),
      weeklyRescue: t('weekly_rescue'), noRecipe: t('no_recipe'),
      aiTitle: t('ai_tonight'), aiPlaceholder: t('ai_placeholder'),
      aiGenerating: t('ai_generating'), aiAsk: t('ai_ask'),
      fav: t('fav'), cook: t('cook'), detail: t('detail'), collapse: t('collapse'),
      cookTitle: t('cook_title'), loadingTxt: t('loading'), noDataTxt: t('noData'),
      presets: [t('preset_1'), t('preset_2'), t('preset_3')],
      min: '分鐘',
      servings: '人份',
      useExpiring: '可耗臨期',
      saveKg: '省',
      matchedWith: t('matched_with'), emptyHint: t('recipe_empty_hint'),
      myRecipesTitle: t('my_recipes'), recordAdd: t('record_add'),
      recordTitleLbl: t('record_title'), recordNoteLbl: t('record_note'),
      recordSave: t('save'), deleteRecipe: t('delete_recipe'), recordEmptyHint: t('record_empty_hint'),
    };
  },

  setMode(e) { this.setData({ mode: e.currentTarget.dataset.mode }); },

  async load() {
    this.setData({ loading: true });
    try {
      const hid = await this._hid();
      const [rows, mine, items] = await Promise.all([
        api.rpc('get_local_recipes', { p_household: hid }),
        api.rpc('get_my_recipes', { p_household: hid }),
        api.rest('GET', 'v_fridge_items_with_risk', { query: '?select=id,name&order=days_left.asc' }),
      ]);
      const recipes = (rows || []).map((r) => Object.assign({}, r, {
        matchedText: (r.matched_items || []).join(' · '),
        waste_saved_kg: Number(r.waste_saved_kg) || 0,
      }));
      this.setData({ loading: false, hasData: true, recipes, myRecipes: this._mapMine(mine), items });
    } catch (e) {
      console.error('recipes load failed', e);
      this.setData({ loading: false, hasData: false });
    }
  },

  async _hid() {
    let hid = getApp().globalData.householdId || api.getActiveHouseholdId();
    if (!hid) {
      const hs = await api.rpc('get_my_households');
      hid = hs && hs.length ? hs[0].id : null;
      if (hid) api.setActiveHouseholdId(hid);
      getApp().globalData.householdId = hid;
    }
    return hid;
  },

  toggle(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ expandedId: this.data.expandedId === id ? null : id });
  },

  // ---------- my recipes (user-recorded) ----------
  _mapMine(rows) {
    return (rows || []).map((r) => Object.assign({}, r, {
      matchedText: (r.matched_items || []).join(' · '),
    }));
  },

  openRecord() { this.setData({ showRecord: true, recTitle: '', recNote: '' }); },
  closeRecord() { this.setData({ showRecord: false }); },
  onRecTitle(e) { this.setData({ recTitle: e.detail.value }); },
  onRecNote(e) { this.setData({ recNote: e.detail.value }); },

  async saveRecord() {
    const title = (this.data.recTitle || '').trim();
    if (!title) {
      wx.showToast({ title: i18n.t('record_name_required'), icon: 'none' });
      return;
    }
    const hid = await this._hid();
    wx.showLoading({ title: this.data.loadingTxt });
    try {
      await api.rest('POST', 'user_recipes', {
        body: { household_id: hid, title, note: (this.data.recNote || '').trim() },
      });
      wx.hideLoading();
      this.setData({ showRecord: false, recTitle: '', recNote: '' });
      wx.showToast({ title: i18n.t('record_saved'), icon: 'success' });
      const rows = await api.rpc('get_my_recipes', { p_household: hid });
      this.setData({ myRecipes: this._mapMine(rows) });
    } catch (e) {
      wx.hideLoading();
      console.error('save recipe failed', e);
      wx.showToast({ title: i18n.t('record_fail'), icon: 'none' });
    }
  },

  async deleteRecipe(e) {
    const id = e.currentTarget.dataset.id;
    try {
      await api.rest('DELETE', 'user_recipes', { query: `?id=eq.${id}` });
      wx.showToast({ title: i18n.t('recipe_deleted'), icon: 'none' });
      const hid = await this._hid();
      const rows = await api.rpc('get_my_recipes', { p_household: hid });
      this.setData({ myRecipes: this._mapMine(rows) });
    } catch (e) {
      console.error('delete recipe failed', e);
      wx.showToast({ title: i18n.t('record_fail'), icon: 'none' });
    }
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

  // ---------- AI ----------
  onQueryInput(e) { this.setData({ query: e.detail.value }); },
  onPreset(e) { this._askAi(e.currentTarget.dataset.query); },
  onAsk() { this._askAi(this.data.query); },

  async _askAi(query) {
    if (this.data.aiLoading) return;
    this.setData({ aiLoading: true, aiError: '' });
    try {
      const hid = await this._hid();
      const res = await api.invoke('recipe-ai-chat', { household_id: hid, query: query || '', allergies: [], dietary: [] });
      const recipes = ((res && res.recipes) || []).map((r) => Object.assign({}, r, { _open: false }));
      this.setData({ aiLoading: false, aiRecipes: recipes, aiDisclaimer: (res && res.disclaimer) || '' });
      if (!recipes.length) wx.showToast({ title: i18n.t('no_recipe'), icon: 'none' });
    } catch (e) {
      console.error('ai recipe failed', e);
      this.setData({ aiLoading: false, aiError: i18n.t('ai_failed') });
      wx.showToast({ title: i18n.t('ai_unavailable'), icon: 'none' });
    }
  },

  toggleAi(e) {
    const idx = e.currentTarget.dataset.idx;
    this.setData({ ['aiRecipes[' + idx + ']._open']: !this.data.aiRecipes[idx]._open });
  },

  save(e) {
    const r = this.data.aiRecipes[e.currentTarget.dataset.idx];
    if (!r) return;
    wx.showLoading({ title: this.data.loadingTxt });
    api.rpc('save_recipe', {
      p_title: r.title, p_prep_time_min: r.prep_time_min, p_difficulty: r.difficulty,
      p_servings: r.servings, p_ingredients: r.ingredients, p_steps: r.steps,
      p_tags: ['AI'], p_source: 'ai',
    }).then(() => {
      wx.hideLoading(); wx.showToast({ title: i18n.t('fav_ok'), icon: 'success' });
    }).catch((err) => {
      wx.hideLoading(); console.error('save failed', err);
      wx.showToast({ title: i18n.t('fav_fail'), icon: 'none' });
    });
  },

  cookAi(e) {
    const r = this.data.aiRecipes[e.currentTarget.dataset.idx];
    if (!r) return;
    const ids = this.matchIds(r);
    if (!ids.length) { wx.showToast({ title: i18n.t('no_match'), icon: 'none' }); return; }
    this._doCook(ids);
  },

  cook(e) {
    const recipe = this.data.recipes.find((r) => r.id === e.currentTarget.dataset.id);
    if (!recipe) return;
    const ids = this.matchIds(recipe);
    if (!ids.length) { wx.showToast({ title: i18n.t('no_match'), icon: 'none' }); return; }
    this._doCook(ids, recipe.id);
  },

  _doCook(ids, recipeId) {
    wx.showModal({
      title: this.data.cookTitle,
      content: i18n.t('cook_confirm', { n: ids.length }),
      success: async (r) => {
        if (!r.confirm) return;
        wx.showLoading({ title: this.data.loadingTxt });
        try {
          const hid = await this._hid();
          if (recipeId) await api.rpc('consume_for_recipe', { p_household: hid, p_recipe: recipeId, p_item_ids: ids });
          else await api.rpc('consume_direct', { p_household: hid, p_item_ids: ids });
          wx.hideLoading(); wx.showToast({ title: i18n.t('done'), icon: 'success' });
          this.load();
        } catch (err) {
          wx.hideLoading(); wx.showToast({ title: i18n.t('retry'), icon: 'none' });
        }
      },
    });
  },
});
