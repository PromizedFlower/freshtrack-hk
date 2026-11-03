const api = require('../../utils/api');
const i18n = require('../../utils/i18n');

const ZONES = ['fridge', 'freezer', 'pantry'];

Page({
  data: {
    loading: true, hasData: false,
    lang: 'zh', theme: 'light', font: 'normal',
    zones: [],
    // edit drawer
    editId: null, editName: '', editExpiry: '', editType: 'best_before', editZone: 'fridge', editToday: '',
  },

  onLoad() {
    const app = getApp();
    this.setData({ lang: app.globalData.lang, theme: app.globalData.theme, font: app.globalData.font });
    const d = new Date();
    this.setData({ editToday: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` });
  },

  onShow() {
    if (!api.getSession().access_token) { wx.redirectTo({ url: '/pages/login/login' }); return; }
    if (this.getTabBar && this.getTabBar()) this.getTabBar().setData({ active: '/pages/fridge/fridge' });
    getApp().applyPrefs();
    this.setData(Object.assign({ lang: i18n.getLang(), theme: i18n.getTheme(), font: i18n.getFont() }, this._labels()));
    this.load();
  },

  _labels() {
    const t = i18n.t;
    return {
      title: t('fridge_title'), emptyZone: t('empty_zone'),
      tConsume: t('consumed'), tDiscard: t('discard'),
      editItem: t('edit_item'), labelName: t('label_name'), labelExpiry: t('label_expiry'),
      labelType: t('label_date_type'), labelZone: t('label_zone'),
      save: t('save'), cancel: t('cancel'), loadingTxt: t('loading'), noDataTxt: t('noData'),
      zoneFridge: t('zone_fridge'), zoneFreezer: t('zone_freezer'), zonePantry: t('zone_pantry'),
      typeLabels: [t('type_best_before'), t('type_use_by')],
    };
  },

  async load() {
    this.setData({ loading: true });
    try {
      const hid = await this._hid();
      if (!hid) { this.setData({ loading: false, hasData: false }); return; }
      const items = await api.rest('GET', 'v_fridge_items_with_risk', {
        query: '?select=id,name,category,quantity,unit,days_left,date_type,expiry_date,risk_level,suggested_action,storage_zone,weight_grams&order=days_left.asc',
      });

      const groups = ZONES.map((z) => ({
        zone: z,
        label: i18n.zoneLabel(z),
        icon: i18n.zoneIcon(z),
        temp: i18n.ZONE_META[z] ? i18n.ZONE_META[z].temp : '',
        items: [],
      }));
      const idx = {};
      (items || []).forEach((it) => {
        const gi = Math.max(0, groups.findIndex((g) => g.zone === it.storage_zone));
        idx[it.id] = { g: gi, i: groups[gi].items.length };
        groups[gi].items.push(Object.assign({}, it, { icon: i18n.catIcon(it.category), offset: 0 }));
      });

      this._idx = idx;
      this.setData({ loading: false, hasData: true, zones: groups });
      this._focusZone();
    } catch (e) {
      console.error('fridge load failed', e);
      this.setData({ loading: false, hasData: false });
    }
  },

  _focusZone() {
    const z = getApp().globalData.focusZone;
    if (!z) return;
    getApp().globalData.focusZone = null;
    wx.nextTick(() => {
      wx.createSelectorQuery().select('#zone-' + z).boundingClientRect().exec((r) => {
        if (r && r[0]) wx.pageScrollTo({ scrollTop: r[0].top - 20, duration: 200 });
      });
    });
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

  // ---- swipe ----
  onTouchStart(e) {
    const t = e.touches[0];
    this._swipe = { id: e.currentTarget.dataset.id, x: t.clientX, y: t.clientY, dx: 0 };
  },
  onTouchMove(e) {
    if (!this._swipe) return;
    const t = e.touches[0];
    const dx = t.clientX - this._swipe.x;
    const dy = t.clientY - this._swipe.y;
    if (Math.abs(dx) < Math.abs(dy)) return;
    this._swipe.dx = Math.max(-140, Math.min(140, dx));
    const ref = this._idx[this._swipe.id];
    if (ref) this.setData({ [`zones[${ref.g}].items[${ref.i}].offset`]: this._swipe.dx });
  },
  onTouchEnd() {
    if (!this._swipe) return;
    const { id, dx } = this._swipe;
    const ref = this._idx[id];
    const reset = () => ref && this.setData({ [`zones[${ref.g}].items[${ref.i}].offset`]: 0 });
    if (dx > 60) { reset(); this._consume(id); }
    else if (dx < -60) { reset(); this._discard(id); }
    else reset();
    this._swipe = null;
  },

  _itemById(id) {
    const ref = this._idx && this._idx[id];
    return ref ? this.data.zones[ref.g].items[ref.i] : null;
  },

  _consume(id) {
    const item = this._itemById(id);
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
    const item = this._itemById(id);
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

  // ---- edit drawer ----
  openEdit(e) {
    const item = this._itemById(e.currentTarget.dataset.id);
    if (!item) return;
    this.setData({
      editId: item.id, editName: item.name, editExpiry: item.expiry_date || this.data.editToday,
      editType: item.date_type || 'best_before', editZone: item.storage_zone || 'fridge',
    });
  },
  onEditName(e) { this.setData({ editName: e.detail.value }); },
  onEditExpiry(e) { this.setData({ editExpiry: e.detail.value }); },
  onEditType(e) { this.setData({ editType: Number(e.detail.value) ? 'use_by' : 'best_before' }); },
  setEditZone(e) { this.setData({ editZone: e.currentTarget.dataset.zone }); },
  closeEdit() { this.setData({ editId: null }); },

  async saveEdit() {
    const { editId, editName, editExpiry, editType, editZone } = this.data;
    wx.showLoading({ title: i18n.t('loading') });
    try {
      await api.rest('PATCH', 'fridge_items', {
        query: `?id=eq.${editId}`,
        body: { name: editName, expiry_date: editExpiry, date_type: editType, storage_zone: editZone },
      });
      wx.hideLoading(); wx.showToast({ title: i18n.t('save'), icon: 'success' });
      this.setData({ editId: null });
      this.load();
    } catch (e) {
      wx.hideLoading(); console.error('edit failed', e);
      wx.showToast({ title: i18n.t('retry'), icon: 'none' });
    }
  },

  goAdd() { wx.switchTab({ url: '/pages/add/add' }); },
});
