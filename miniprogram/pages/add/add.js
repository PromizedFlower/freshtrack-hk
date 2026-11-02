const api = require('../../utils/api');
const i18n = require('../../utils/i18n');

const ZONES = ['fridge', 'freezer', 'pantry'];
const DATE_TYPES = ['best_before', 'use_by'];

function dateOnly(s) { return (s || '').toString().slice(0, 10); }

Page({
  data: {
    mode: 'manual', // receipt | food | manual
    scanning: false,
    detected: [],
    today: '',
    lang: 'zh', theme: 'light', font: 'normal',
    cats: [], pickIndex: 0,
    zones: ZONES, zoneLabels: [],
    form: {
      name: '', category: 'Produce', quantity: '1', unit: 'pcs',
      weight_grams: '200', price_hkd: '0', date_type: 'best_before',
      expiry_date: '', storage_zone: 'fridge',
    },
  },

  onLoad() {
    const app = getApp();
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    this.setData({ today, 'form.expiry_date': today, lang: app.globalData.lang, theme: app.globalData.theme, font: app.globalData.font });
  },

  onShow() {
    if (!api.getSession().access_token) { wx.redirectTo({ url: '/pages/login/login' }); return; }
    getApp().applyPrefs();
    this.setData(Object.assign(
      { lang: i18n.getLang(), theme: i18n.getTheme(), font: i18n.getFont() },
      this._labels(),
    ));
    this._syncCats();
  },

  _labels() {
    const t = i18n.t;
    return {
      modeReceipt: t('mode_receipt'), modeFood: t('mode_food'), modeManual: t('mode_manual'),
      scanReceipt: t('scan_receipt'), scanFood: t('scan_food'), scanning: t('scanning'),
      detected: t('detected'), confirmAdd: t('confirm_add'),
      addTitle: t('add_title'), catTitle: t('cat_title'),
      addNamePh: t('add_name_ph'), addDays: t('add_days'), addZone: t('add_zone'),
      addPrice: t('add_price'), addSave: t('add_save'),
      labelName: t('label_name'), labelExpiry: t('label_expiry'), labelType: t('label_date_type'),
      loadingTxt: t('loading'),
      zoneLabels: ZONES.map((z) => i18n.zoneLabel(z)),
      typeBest: t('type_best_before'), typeUseBy: t('type_use_by'),
      typeLabels: [t('type_best_before'), t('type_use_by')],
    };
  },

  // 8-icon category picker -> backend category
  _syncCats() {
    const cats = i18n.PICKER_CATS.map((c, i) => ({ id: i, icon: c.icon, label: i18n.t(c.name), category: c.category }));
    this.setData({ cats });
  },
  selectCat(e) {
    const i = Number(e.currentTarget.dataset.index);
    this.setData({ pickIndex: i, 'form.category': i18n.PICKER_CATS[i].category });
  },

  setMode(e) { this.setData({ mode: e.currentTarget.dataset.mode, detected: [] }); },

  chooseImage() {
    const mode = this.data.mode;
    wx.chooseMedia({
      count: 1, mediaType: ['image'], sourceType: ['camera', 'album'],
      success: (res) => this.scan(res.tempFiles[0].tempFilePath, mode),
    });
  },

  scan(tempFilePath, mode) {
    this.setData({ scanning: true });
    wx.getFileSystemManager().readFile({
      filePath: tempFilePath, encoding: 'base64',
      success: async (res) => {
        const image_base64 = res.data;
        try {
          let detected = [];
          if (mode === 'receipt') {
            const r = await api.invoke('ai-scan-receipt', { image_base64, mime_type: 'image/jpeg' });
            detected = (r && r.items) || [];
          } else {
            const r = await api.invoke('ai-scan-food', { image_base64, mime_type: 'image/jpeg', mode: 'item' });
            detected = ((r && r.detected_items) || []).map((d) => ({
              name: d.name, category: d.category, quantity: 1, unit: 'pcs',
              weight_grams: 200, price_hkd: 0, date_type: d.date_type || 'best_before',
              expiry_date: dateOnly(d.expiry_date) || this.data.today,
            }));
          }
          this.setData({ scanning: false, detected });
          if (!detected.length) wx.showToast({ title: i18n.getLang() === 'en' ? 'Nothing detected' : '未识别到食材', icon: 'none' });
        } catch (e) {
          console.error('scan failed', e);
          this.setData({ scanning: false });
          wx.showToast({ title: i18n.getLang() === 'en' ? 'Scan failed' : '识别失败，请重试', icon: 'none' });
        }
      },
      fail: () => { this.setData({ scanning: false }); wx.showToast({ title: i18n.getLang() === 'en' ? 'Read failed' : '读取图片失败', icon: 'none' }); },
    });
  },

  async confirmDetected() {
    const hid = await this._hid();
    const mode = this.data.mode;
    const items = this.data.detected.map((d) => ({
      household_id: hid, name: d.name, category: d.category || 'Produce',
      quantity: Number(d.quantity) || 1, unit: d.unit || 'pcs',
      weight_grams: Number(d.weight_grams || d.weight_g) || 200,
      price_hkd: Number(d.price_hkd) || 0,
      expiry_date: dateOnly(d.expiry_date || d.suggested_expiry_date) || this.data.today,
      date_type: d.date_type || 'best_before',
      storage_zone: d.storage_zone || 'fridge',
      source_method: mode === 'receipt' ? 'receipt' : 'photo',
    }));
    wx.showLoading({ title: this.data.loadingTxt });
    try {
      await api.rest('POST', 'fridge_items', { body: items });
      wx.hideLoading();
      wx.showToast({ title: i18n.t('add_saved'), icon: 'success' });
      this.setData({ detected: [] });
    } catch (e) {
      wx.hideLoading(); console.error('save failed', e);
      wx.showToast({ title: i18n.t('retry'), icon: 'none' });
    }
  },

  onInput(e) { const k = e.currentTarget.dataset.key; this.setData({ [`form.${k}`]: e.detail.value }); },
  onZone(e) { this.setData({ 'form.storage_zone': ZONES[Number(e.detail.value)] }); },
  onType(e) { this.setData({ 'form.date_type': DATE_TYPES[Number(e.detail.value)] }); },
  onExpiry(e) { this.setData({ 'form.expiry_date': e.detail.value }); },

  async saveManual() {
    const f = this.data.form;
    if (!f.name || !f.expiry_date) { wx.showToast({ title: i18n.t('add_name_ph'), icon: 'none' }); return; }
    const hid = await this._hid();
    const item = {
      household_id: hid, name: f.name, category: f.category,
      quantity: Number(f.quantity) || 1, unit: f.unit || 'pcs',
      weight_grams: Number(f.weight_grams) || 200, price_hkd: Number(f.price_hkd) || 0,
      expiry_date: f.expiry_date, date_type: f.date_type,
      storage_zone: f.storage_zone, source_method: 'manual',
    };
    wx.showLoading({ title: this.data.loadingTxt });
    try {
      await api.rest('POST', 'fridge_items', { body: item });
      wx.hideLoading(); wx.showToast({ title: i18n.t('add_saved'), icon: 'success' });
      this.setData({ 'form.name': '', 'form.expiry_date': this.data.today });
    } catch (e) {
      wx.hideLoading(); console.error('save failed', e);
      wx.showToast({ title: i18n.t('retry'), icon: 'none' });
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
});
