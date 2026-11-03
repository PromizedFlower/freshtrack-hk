const api = require('../../utils/api');
const i18n = require('../../utils/i18n');

function autoPeriod() {
  const h = new Date().getHours();
  if (h >= 6 && h < 11) return 'morning';
  if (h >= 11 && h < 18) return 'afternoon';
  return 'night';
}

Page({
  data: {
    loading: true,
    hasData: false,
    lang: 'zh', theme: 'light', font: 'normal',
    period: 'afternoon',
    clock: '', dateStr: '', greeting: '',
    kpi: null,
    zoneCounts: { fridge: 0, freezer: 0, pantry: 0 },
    items: [],
    _timer: null,
  },

  onLoad() {
    const app = getApp();
    this.setData({
      lang: app.globalData.lang, theme: app.globalData.theme, font: app.globalData.font,
    });
  },

  onShow() {
    if (!api.getSession().access_token) { wx.redirectTo({ url: '/pages/login/login' }); return; }
    if (this.getTabBar && this.getTabBar()) this.getTabBar().setData({ active: '/pages/dashboard/dashboard' });
    getApp().applyPrefs();
    this.setData(Object.assign({ lang: i18n.getLang(), theme: i18n.getTheme(), font: i18n.getFont() }, this._labels()));
    this.load();
    this._startClock();
  },

  _labels() {
    const t = i18n.t;
    return {
      tConsume: t('consumed'), tDiscard: t('discard'),
      tipConsume: t('swipe_tip_consume'), tipEdit: t('swipe_tip_edit'), tipDiscard: t('swipe_tip_discard'),
      kpiInFridge: t('kpi_in_fridge'), kpiExpiring: t('kpi_expiring'), kpiSaved: t('me_month_kg'),
      zoneFridge: t('zone_fridge'), zoneFreezer: t('zone_freezer'), zonePantry: t('zone_pantry'),
      quickAdd: t('quick_add'), quickRecipes: t('quick_recipes'), quickImpact: t('quick_impact'),
      todayTop: t('today_expiring_top'), loadingTxt: t('loading'), noDataTxt: t('noData'),
    };
  },

  onHide() { if (this.data._timer) clearInterval(this.data._timer); },
  onUnload() { if (this.data._timer) clearInterval(this.data._timer); },

  _startClock() {
    if (this.data._timer) clearInterval(this.data._timer);
    const tick = () => {
      const now = new Date();
      const dateStr = now.toLocaleDateString(i18n.getLang() === 'en' ? 'en-US' : 'zh-HK', {
        month: 'numeric', day: 'numeric', weekday: 'short',
      });
      const clock = now.toTimeString().slice(0, 8);
      const period = autoPeriod();
      const patch = { clock, dateStr, period };
      if (this.data.greeting !== i18n.t('greeting_' + period)) patch.greeting = i18n.t('greeting_' + period);
      this.setData(patch);
    };
    tick();
    this.setData({ _timer: setInterval(tick, 1000) });
  },

  async load() {
    this.setData({ loading: true });
    try {
      const hid = await this._hid();
      if (!hid) { this.setData({ loading: false, hasData: false }); return; }
      const [kpi, items] = await Promise.all([
        api.rpc('get_household_kpi', { p_household: hid }),
        api.rest('GET', 'v_fridge_items_with_risk', {
          query: '?select=id,name,category,days_left,date_type,risk_level,storage_zone,expiry_date,weight_grams&order=days_left.asc',
        }),
      ]);
      const zoneCounts = { fridge: 0, freezer: 0, pantry: 0 };
      const mapped = (items || []).map((it) => {
        const z = it.storage_zone;
        if (zoneCounts[z] !== undefined) zoneCounts[z] += 1;
        return Object.assign({}, it, { icon: i18n.catIcon(it.category), offset: 0 });
      });
      this.setData({
        loading: false, hasData: true, kpi, zoneCounts, items: mapped,
        period: autoPeriod(),
        greeting: i18n.t('greeting_' + autoPeriod()),
      });
    } catch (e) {
      console.error('dashboard load failed', e);
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

  // ---- swipe physics (touch) ----
  onTouchStart(e) {
    const t = e.touches[0];
    this._swipe = { id: e.currentTarget.dataset.id, x: t.clientX, y: t.clientY, dx: 0 };
  },
  onTouchMove(e) {
    if (!this._swipe) return;
    const t = e.touches[0];
    const dx = t.clientX - this._swipe.x;
    const dy = t.clientY - this._swipe.y;
    if (Math.abs(dx) < Math.abs(dy)) return; // vertical scroll
    this._swipe.dx = Math.max(-140, Math.min(140, dx));
    const idx = this.data.items.findIndex((i) => i.id === this._swipe.id);
    if (idx >= 0) this.setData({ ['items[' + idx + '].offset']: this._swipe.dx });
  },
  onTouchEnd() {
    if (!this._swipe) return;
    const { id, dx } = this._swipe;
    const idx = this.data.items.findIndex((i) => i.id === id);
    const reset = () => idx >= 0 && this.setData({ ['items[' + idx + '].offset']: 0 });
    if (dx > 60) { reset(); this._consume(id); }
    else if (dx < -60) { reset(); this._discard(id); }
    else reset();
    this._swipe = null;
  },

  _consume(id) {
    const item = this.data.items.find((i) => i.id === id);
    wx.showModal({
      title: i18n.t('consumed'),
      content: i18n.t('confirm_consume', { name: item ? item.name : '' }),
      success: async (r) => {
        if (!r.confirm) return;
        wx.showLoading({ title: i18n.t('loading') });
        try {
          const hid = await this._hid();
          await api.rpc('consume_direct', { p_household: hid, p_item_ids: [id] });
          wx.hideLoading(); wx.showToast({ title: i18n.t('add_saved'), icon: 'success' });
          this.load();
        } catch (e) { wx.hideLoading(); wx.showToast({ title: i18n.t('retry'), icon: 'none' }); }
      },
    });
  },

  _discard(id) {
    const item = this.data.items.find((i) => i.id === id);
    wx.showModal({
      title: i18n.t('discard'),
      content: i18n.t('confirm_discard', { name: item ? item.name : '' }),
      success: async (r) => {
        if (!r.confirm) return;
        wx.showLoading({ title: i18n.t('loading') });
        try {
          const hid = await this._hid();
          await api.rpc('discard_direct', { p_household: hid, p_item_ids: [id] });
          wx.hideLoading(); wx.showToast({ title: i18n.t('add_saved'), icon: 'success' });
          this.load();
        } catch (e) { wx.hideLoading(); wx.showToast({ title: i18n.t('retry'), icon: 'none' }); }
      },
    });
  },

  goFridgeZone(e) {
    wx.switchTab({ url: '/pages/fridge/fridge' });
    getApp().globalData.focusZone = e.currentTarget.dataset.zone;
  },
  goAdd() { wx.switchTab({ url: '/pages/add/add' }); },
  goRecipes() { wx.switchTab({ url: '/pages/recipes/recipes' }); },
  goImpact() { wx.switchTab({ url: '/pages/impact/impact' }); },
});
