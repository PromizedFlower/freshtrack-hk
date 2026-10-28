const api = require('../../utils/api');

const CATEGORIES = ['Produce', 'Dairy', 'Meat', 'Bakery', 'Pantry'];
const ZONES = ['fridge', 'freezer', 'pantry'];
const DATE_TYPES = ['best_before', 'use_by'];

function dateOnly(s) { return (s || '').toString().slice(0, 10); }

Page({
  data: {
    mode: 'receipt', // receipt | food | manual
    scanning: false,
    detected: [],
    today: '',
    categories: CATEGORIES,
    zones: ZONES,
    dateTypes: DATE_TYPES,
    catIndex: 0,
    catLabels: ['蔬果', '奶制品', '肉类', '面包烘焙', '干货'],
    zoneLabels: ['冷藏', '冷冻', '常温'],
    typeLabels: ['最佳赏味 (best-before)', '此日期前食用 (use-by)'],
    form: {
      name: '', category: 'Produce', quantity: '1', unit: 'pcs',
      weight_grams: '200', price_hkd: '0', date_type: 'best_before',
      expiry_date: '', storage_zone: 'fridge',
    },
  },

  onLoad() {
    const today = dateOnly(new Date().toISOString());
    this.setData({ today, 'form.expiry_date': today });
  },

  onShow() {
    if (!api.getSession().access_token) { wx.redirectTo({ url: '/pages/login/login' }); return; }
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
          if (!detected.length) wx.showToast({ title: '未识别到食材', icon: 'none' });
        } catch (e) {
          console.error('scan failed', e);
          this.setData({ scanning: false });
          wx.showToast({ title: '识别失败，请重试', icon: 'none' });
        }
      },
      fail: () => { this.setData({ scanning: false }); wx.showToast({ title: '读取图片失败', icon: 'none' }); },
    });
  },

  async confirmDetected() {
    const hid = await this._hid();
    const mode = this.data.mode;
    const items = this.data.detected.map((d) => ({
      household_id: hid,
      name: d.name,
      category: d.category || 'Produce',
      quantity: Number(d.quantity) || 1,
      unit: d.unit || 'pcs',
      weight_grams: Number(d.weight_grams || d.weight_g) || 200,
      price_hkd: Number(d.price_hkd) || 0,
      expiry_date: dateOnly(d.expiry_date || d.suggested_expiry_date) || this.data.today,
      date_type: d.date_type || 'best_before',
      storage_zone: d.storage_zone || 'fridge',
      source_method: mode === 'receipt' ? 'receipt' : 'photo',
    }));
    wx.showLoading({ title: '保存中' });
    try {
      await api.rest('POST', 'fridge_items', { body: items });
      wx.hideLoading();
      wx.showToast({ title: '已入库', icon: 'success' });
      this.setData({ detected: [] });
    } catch (e) {
      console.error('save failed', e);
      wx.hideLoading();
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  onInput(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [`form.${key}`]: e.detail.value });
  },
  onCat(e) {
    const i = Number(e.detail.value);
    this.setData({ catIndex: i, 'form.category': CATEGORIES[i] });
  },
  onZone(e) { this.setData({ 'form.storage_zone': ZONES[Number(e.detail.value)] }); },
  onType(e) { this.setData({ 'form.date_type': DATE_TYPES[Number(e.detail.value)] }); },
  onExpiry(e) { this.setData({ 'form.expiry_date': e.detail.value }); },

  async saveManual() {
    const f = this.data.form;
    if (!f.name || !f.expiry_date) { wx.showToast({ title: '请填写名称和日期', icon: 'none' }); return; }
    const hid = await this._hid();
    const item = {
      household_id: hid, name: f.name, category: f.category,
      quantity: Number(f.quantity) || 1, unit: f.unit || 'pcs',
      weight_grams: Number(f.weight_grams) || 200, price_hkd: Number(f.price_hkd) || 0,
      expiry_date: f.expiry_date, date_type: f.date_type,
      storage_zone: f.storage_zone, source_method: 'manual',
    };
    wx.showLoading({ title: '保存中' });
    try {
      await api.rest('POST', 'fridge_items', { body: item });
      wx.hideLoading();
      wx.showToast({ title: '已入库', icon: 'success' });
      this.setData({ 'form.name': '', 'form.expiry_date': this.data.today });
    } catch (e) {
      console.error('save failed', e);
      wx.hideLoading();
      wx.showToast({ title: '保存失败', icon: 'none' });
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
