const api = require('../../utils/api');
const i18n = require('../../utils/i18n');

Page({
  data: {
    loading: true, hasData: false,
    lang: 'zh', theme: 'light', font: 'normal',
    me: null, initial: '', roleLabel: '', householdText: '',
    members: [], memberCountText: '', myHouseholds: [],
    showFamily: '', joinCode: '', joinErr: '',
    kpi: null, trend: [],
    restock: [], restockName: '', showRestock: false,
    cats: [], restockPickIndex: 0, restockQty: '1', restockCategory: 'Produce',
  },

  onLoad() {
    const app = getApp();
    this.setData({ lang: app.globalData.lang, theme: app.globalData.theme, font: app.globalData.font });
  },

  onShow() {
    if (!api.getSession().access_token) { wx.redirectTo({ url: '/pages/login/login' }); return; }
    if (this.getTabBar && this.getTabBar()) this.getTabBar().setData({ active: '/pages/impact/impact' });
    getApp().applyPrefs();
    this.setData(Object.assign({ lang: i18n.getLang(), theme: i18n.getTheme(), font: i18n.getFont() }, this._labels()));
    this._syncRestockCats();
    this.load();
    this._loadMe();
  },

  _labels() {
    const t = i18n.t;
    return {
      meSdg: t('me_sdg'), meSdgSub: t('me_sdg_sub'),
      monthKg: t('me_month_kg'), monthHkd: t('me_month_hkd'), monthCo2: t('me_month_co2'),
      trendTitle: t('me_trend'), statTracked: t('stat_tracked'), statExpiring: t('stat_expiring'),
      restockTitle: t('me_restock'), restockAdd: t('me_restock_add'), restockEmpty: t('me_restock_empty'),
      restockBought: t('me_restock_bought'), restockCancel: t('me_restock_cancel'),
      restockNamePh: t('restock_name_ph'), restockQtyTxt: t('restock_qty'), restockCatTxt: t('restock_cat'),
      prefs: t('me_prefs'), prefLang: t('pref_lang'), prefTheme: t('pref_theme'), prefFont: t('pref_font'),
      prefZh: t('pref_zh'), prefEn: t('pref_en'), prefLight: t('pref_light'), prefDark: t('pref_dark'),
      font100: t('pref_font_100'), font125: t('pref_font_125'),
      addPh: i18n.getLang() === 'en' ? 'e.g. Milk 1L' : '例如：鲜牛奶 1L',
      save: t('save'), cancel: t('cancel'), loadingTxt: t('loading'),
      signOut: t('sign_out'),
      familyTitle: t('family_title'), inviteCode: t('invite_code'),
      copy: t('copy'), selfTag: t('self_tag'),
      familySwitch: t('family_switch'), familyJoin: t('family_join'), familyLeave: t('family_leave'),
      switchTitle: t('switch_title'), joinCodePh: t('join_code_ph'), joinBtn: t('join_btn'),
      current: t('current'),
      manageMembers: t('manage_members'), transferOwner: t('transfer_owner'), removeMember: t('remove_member'),
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
      const lang = i18n.getLang();
      const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const maxKg = Math.max(1, ...(trend || []).map((t) => t.saved_kg || 0));
      const withPct = (trend || []).map((t) => {
        const mm = Number(String(t.month || '').slice(5, 7)) || 0;
        const label = lang === 'en' ? (MONTHS_EN[mm - 1] || mm) : (mm + '月');
        return Object.assign({}, t, { pct: Math.round(((t.saved_kg || 0) / maxKg) * 100), label });
      });
      const restockMapped = (restock || []).map((r) => Object.assign({}, r, { icon: i18n.catIcon(r.category) }));
      this.setData({ loading: false, hasData: true, kpi, trend: withPct, restock: restockMapped });
    } catch (e) {
      console.error('impact load failed', e);
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

  async _loadMe() {
    try {
      const me = await api.rpc('get_me');
      const initial = String(me.display_name || me.email || '?').charAt(0);
      let members = [];
      let memberCountText = '';
      if (me.household_id) {
        members = (await api.rpc('get_household_members', { p_household: me.household_id }) || [])
          .map((m) => Object.assign({}, m, {
            initial: String(m.display_name || m.email || '?').charAt(0),
            roleLabel: i18n.roleLabel(m.role),
          }));
        memberCountText = i18n.t('family_members', { n: members.length });
      }
      const myHouseholds = (await api.rpc('get_my_households') || [])
        .map((h) => Object.assign({}, h, { roleLabel: i18n.roleLabel(h.role) }));
      this.setData({
        me, initial, members, memberCountText, myHouseholds,
        roleLabel: i18n.roleLabel(me.role),
        householdText: me.household_name
          ? (me.household_name + ' · ' + i18n.roleLabel(me.role))
          : i18n.t('profile_no_household'),
      });
    } catch (e) {
      console.error('get_me failed', e);
    }
  },

  openSwitch() { this.setData({ showFamily: 'switch' }); },
  openJoin() { this.setData({ showFamily: 'join', joinCode: '', joinErr: '' }); },
  closeFamily() { this.setData({ showFamily: '' }); },
  onJoinCode(e) { this.setData({ joinCode: e.detail.value, joinErr: '' }); },

  async switchHousehold(e) {
    const id = e.currentTarget.dataset.id;
    api.setActiveHouseholdId(id);
    getApp().globalData.householdId = id;
    this.setData({ showFamily: '' });
    this.load();
    this._loadMe();
  },

  async doJoin() {
    const code = (this.data.joinCode || '').trim();
    if (!code) return;
    wx.showLoading({ title: this.data.loadingTxt });
    try {
      const joined = await api.rpc('join_household', { p_invite_code: code });
      wx.hideLoading();
      const id = joined.household_id;
      api.setActiveHouseholdId(id);
      getApp().globalData.householdId = id;
      this.setData({ showFamily: '', joinCode: '' });
      wx.showToast({ title: i18n.t('joined_ok', { name: joined.household_name }), icon: 'none' });
      this.load();
      this._loadMe();
    } catch (e) {
      wx.hideLoading();
      this.setData({ joinErr: this._errMsg(e) || i18n.t('join_fail') });
    }
  },

  doLeave() {
    const me = this.data.me;
    if (!me || !me.household_id) return;
    wx.showModal({
      title: i18n.t('family_leave'),
      content: i18n.t('leave_confirm', { name: me.household_name }),
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await api.rpc('leave_household', { p_household: me.household_id });
          api.setActiveHouseholdId(null);
          getApp().globalData.householdId = null;
          wx.showToast({ title: i18n.t('left_ok'), icon: 'none' });
          this.load();
          this._loadMe();
        } catch (e) {
          wx.showToast({ title: this._errMsg(e) || i18n.t('leave_fail'), icon: 'none' });
        }
      },
    });
  },

  _errMsg(e) {
    const d = e && e.data;
    return d && (d.message || d.msg || d.error_description || d.error);
  },

  openManage() { this.setData({ showFamily: 'manage' }); },

  transferOwner(e) {
    const id = e.currentTarget.dataset.id;
    const m = this.data.members.find((x) => x.user_id === id);
    const me = this.data.me;
    if (!m || !me) return;
    wx.showModal({
      title: i18n.t('transfer_owner'),
      content: i18n.t('transfer_confirm', { name: m.display_name }),
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await api.rpc('transfer_ownership', { p_household: me.household_id, p_new_owner_id: id });
          wx.showToast({ title: i18n.t('transferred'), icon: 'none' });
          this.setData({ showFamily: '' });
          this._loadMe();
          this.load();
        } catch (err) {
          wx.showToast({ title: this._errMsg(err) || i18n.t('manage_fail'), icon: 'none' });
        }
      },
    });
  },

  removeMember(e) {
    const id = e.currentTarget.dataset.id;
    const m = this.data.members.find((x) => x.user_id === id);
    const me = this.data.me;
    if (!m || !me) return;
    wx.showModal({
      title: i18n.t('remove_member'),
      content: i18n.t('remove_confirm', { name: m.display_name }),
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await api.rpc('remove_member', { p_household: me.household_id, p_user_id: id });
          wx.showToast({ title: i18n.t('removed'), icon: 'none' });
          this._loadMe();
          this.load();
        } catch (err) {
          wx.showToast({ title: this._errMsg(err) || i18n.t('manage_fail'), icon: 'none' });
        }
      },
    });
  },

  copyInvite() {
    const code = this.data.me && this.data.me.invite_code;
    if (!code) return;
    wx.setClipboardData({
      data: code,
      success: () => wx.showToast({ title: i18n.t('copied'), icon: 'none' }),
    });
  },

  signOut() {
    wx.showModal({
      title: i18n.t('sign_out'),
      content: i18n.getLang() === 'en' ? 'Sign out of this device?' : '确定要退出当前账号吗？',
      success: (r) => {
        if (!r.confirm) return;
        api.clearSession();
        const app = getApp();
        app.globalData.loggedIn = false;
        app.globalData.user = null;
        app.globalData.householdId = null;
        wx.reLaunch({ url: '/pages/login/login' });
      },
    });
  },

  // ---- restock / group-buy list ----
  _syncRestockCats() {
    const cats = i18n.PICKER_CATS.map((c, i) => ({
      id: i, icon: c.icon, label: i18n.t(c.name), category: c.category,
    }));
    this.setData({ cats });
  },

  openRestock() {
    this.setData({
      showRestock: true, restockName: '', restockQty: '1',
      restockPickIndex: 0, restockCategory: i18n.PICKER_CATS[0].category,
    });
  },
  closeRestock() { this.setData({ showRestock: false }); },
  onRestockName(e) { this.setData({ restockName: e.detail.value }); },
  onRestockQty(e) { this.setData({ restockQty: e.detail.value }); },
  selectRestockCat(e) {
    const i = Number(e.currentTarget.dataset.index);
    this.setData({ restockPickIndex: i, restockCategory: i18n.PICKER_CATS[i].category });
  },

  async addRestock() {
    const name = (this.data.restockName || '').trim();
    if (!name) {
      wx.showToast({ title: i18n.t('restock_name_required'), icon: 'none' });
      return;
    }
    const hid = await this._hid();
    wx.showLoading({ title: this.data.loadingTxt });
    try {
      await api.rest('POST', 'shopping_list', {
        body: {
          household_id: hid, item_name: name, category: this.data.restockCategory,
          quantity: Number(this.data.restockQty) || 1, unit: 'pcs',
        },
      });
      wx.hideLoading();
      this.setData({ showRestock: false, restockName: '', restockQty: '1' });
      wx.showToast({ title: i18n.t('restock_added'), icon: 'success' });
      this._reloadRestock();
    } catch (e) {
      wx.hideLoading();
      console.error('add restock failed', e);
      wx.showToast({ title: this._errMsg(e) || i18n.t('restock_fail'), icon: 'none' });
    }
  },

  async markBought(e) {
    const id = e.currentTarget.dataset.id;
    try {
      await api.rest('PATCH', 'shopping_list', { query: `?id=eq.${id}`, body: { status: 'bought' } });
      this._reloadRestock();
      wx.showToast({ title: i18n.t('me_restock_bought'), icon: 'none' });
    } catch (e) {
      console.error('bought failed', e);
      wx.showToast({ title: this._errMsg(e) || i18n.t('restock_fail'), icon: 'none' });
    }
  },

  async cancelRestock(e) {
    const id = e.currentTarget.dataset.id;
    try {
      await api.rest('DELETE', 'shopping_list', { query: `?id=eq.${id}` });
      this._reloadRestock();
      wx.showToast({ title: i18n.t('me_restock_cancel'), icon: 'none' });
    } catch (e) {
      console.error('cancel failed', e);
      wx.showToast({ title: this._errMsg(e) || i18n.t('restock_fail'), icon: 'none' });
    }
  },

  async _reloadRestock() {
    try {
      const hid = await this._hid();
      const restock = await api.rest('GET', 'shopping_list', { query: `?household_id=eq.${hid}&order=created_at.desc` });
      this.setData({ restock: (restock || []).map((r) => Object.assign({}, r, { icon: i18n.catIcon(r.category) })) });
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
