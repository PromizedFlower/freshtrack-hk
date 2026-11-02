const api = require('../../utils/api');
const i18n = require('../../utils/i18n');

Page({
  data: {
    loading: true, hasData: false,
    lang: 'zh', theme: 'light', font: 'normal',
    kpi: null, trend: [],
    restock: [], restockName: '', showRestock: false,
  },

  onLoad() {
    const app = getApp();
    this.setData({ lang: app.globalData.lang, theme: app.globalData.theme, font: app.globalData.font });
  },

  onShow() {
    if (!api.getSession().access_token) { wx.redirectTo({ url: '/pages/login/login' }); return; }
    getApp().applyPrefs();
    this.setData(Object.assign({ lang: i18n.getLang(), theme: i18n.getTheme(), font: i18n.getFont() }, this._labels()));
    this.load();
  },

  _labels() {
    const t = i18n.t;
    return {
      meSdg: t('me_sdg'), meSdgSub: t('me_sdg_sub'),
      monthKg: t('me_month_kg'), monthHkd: t('me_month_hkd'), monthCo2: t('me_month_co2'),
      trend: t('me_trend'), statTracked: t('stat_tracked'), statExpiring: t('stat_expiring'),
      restock: t('me_restock'), restockAdd: t('me_restock_add'), restockEmpty: t('me_restock_empty'),
      restockBought: t('me_restock_bought'), restockCancel: t('me_restock_cancel'),
      prefs: t('me_prefs'), prefLang: t('pref_lang'), prefTheme: t('pref_theme'), prefFont: t('pref_font'),
      prefZh: t('pref_zh'), prefEn: t('pref_en'), prefLight: t('pref_light'), prefDark: t('pref_dark'),
      font100: t('pref_font_100'), font125: t('pref_font_125'),
      addPh: i18n.getLang() === 'en' ? 'e.g. Milk 1L' : '例如：鲜牛奶 1L',
      save: t('save'), cancel: t('cancel'), loadingTxt: t('loading'),
    };
  },

  async load() {
    this.setData({ loading: true });
    try {
      const hid = await this._hid();
      if (!hid) { this.setData({ loading: false, hasData: false }); return; }
      const [kpi, trend, restock] = await Promise.all([
        api.rpc('get_household_kpi', { p_household: hid }),
        api.rpc('get_household_trend', { p_household: hid }),
        api.rest('GET', 'shopping_list', { query: `?household_id=eq.${hid}&order=created_at.desc` }),
      ]);
      const maxKg = Math.max(1, ...(trend || []).map((t) => t.saved_kg || 0));
      const withPct = (trend || []).map((t) => ({ ...t, pct: Math.round((t.saved_kg / maxKg) * 100) }));
      this.setData({ loading: false, hasData: true, kpi, trend: withPct, restock: restock || [] });
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

  // ---- restock list ----
  openRestock() { this.setData({ showRestock: true, restockName: '' }); },
  closeRestock() { this.setData({ showRestock: false }); },
  onRestockName(e) { this.setData({ restockName: e.detail.value }); },

  async addRestock() {
    const name = this.data.restockName.trim();
    if (!name) return;
    const hid = await this._hid();
    wx.showLoading({ title: this.data.loadingTxt });
    try {
      await api.rest('POST', 'shopping_list', { body: { household_id: hid, item_name: name } });
      wx.hideLoading();
      this.setData({ showRestock: false, restockName: '' });
      this._reloadRestock();
    } catch (e) { wx.hideLoading(); console.error('add restock failed', e); }
  },

  async markBought(e) {
    const id = e.currentTarget.dataset.id;
    try {
      await api.rest('PATCH', 'shopping_list', { query: `?id=eq.${id}`, body: { status: 'bought' } });
      this._reloadRestock();
    } catch (e) { console.error('bought failed', e); }
  },

  async cancelRestock(e) {
    const id = e.currentTarget.dataset.id;
    try {
      await api.rest('DELETE', 'shopping_list', { query: `?id=eq.${id}` });
      this._reloadRestock();
    } catch (e) { console.error('cancel failed', e); }
  },

  async _reloadRestock() {
    try {
      const hid = await this._hid();
      const restock = await api.rest('GET', 'shopping_list', { query: `?household_id=eq.${hid}&order=created_at.desc` });
      this.setData({ restock: restock || [] });
    } catch (e) { console.error(e); }
  },

  // ---- preferences ----
  setLang(e) {
    const lang = e.currentTarget.dataset.lang;
    i18n.setLang(lang);
    getApp().globalData.lang = lang;
    getApp().applyPrefs();
    this.setData(Object.assign({ lang }, this._labels()));
  },
  setTheme(e) {
    const theme = e.currentTarget.dataset.theme;
    i18n.setTheme(theme);
    getApp().globalData.theme = theme;
    getApp().applyPrefs();
    this.setData({ theme });
  },
  setFont(e) {
    const font = e.currentTarget.dataset.font;
    i18n.setFont(font);
    getApp().globalData.font = font;
    this.setData({ font });
  },
});
