const api = require('../../utils/api');
const config = require('../../utils/config');
const i18n = require('../../utils/i18n');

Page({
  data: {
    email: '', password: '', loading: false, error: '',
    lang: 'zh', theme: 'light', font: 'normal',
    accounts: [],
  },

  onLoad() {
    const app = getApp();
    this.setData({ lang: app.globalData.lang, theme: app.globalData.theme, font: app.globalData.font });
  },

  onShow() {
    this._refresh();
  },

  _refresh() {
    const lang = i18n.getLang(), theme = i18n.getTheme(), font = i18n.getFont();
    const accounts = config.DEMO_ACCOUNTS.map((a) => Object.assign({}, a, { roleLabel: i18n.roleLabel(a.role) }));
    this.setData(Object.assign({ lang, theme, font, accounts }, this._labels()));
    try {
      wx.setNavigationBarColor({ frontColor: '#ffffff', backgroundColor: theme === 'dark' ? '#121816' : '#0B3B2E' });
    } catch (e) { /* non-fatal */ }
  },

  _labels() {
    const t = i18n.t;
    return {
      tagline: t('login_tagline'),
      emailPh: t('login_email_ph'), pwdPh: t('login_pwd_ph'),
      loginBtn: t('login_btn'), signupBtn: t('signup_btn'),
      demoTitle: t('login_demo_title'), demoSub: t('login_demo_sub'),
    };
  },

  onEmail(e) { this.setData({ email: e.detail.value }); },
  onPwd(e) { this.setData({ password: e.detail.value }); },

  doLogin() {
    if (!this._valid()) return;
    this._auth(() => api.signIn(this.data.email, this.data.password), 'err_login');
  },

  async doSignup() {
    if (!this._valid()) return;
    this.setData({ loading: true, error: '' });
    try {
      await api.signUp(this.data.email, this.data.password);
      const t = await api.signIn(this.data.email, this.data.password);
      api.setSession(t);
      this._enter();
    } catch (e) {
      this.setData({ error: this._msg(e) || i18n.t('err_signup') });
    } finally {
      this.setData({ loading: false });
    }
  },

  demoLogin(e) {
    const email = e.currentTarget.dataset.email;
    this.setData({ loading: true, error: '' });
    this._auth(() => api.signIn(email, config.DEMO_PASSWORD), 'err_demo');
  },

  _valid() {
    if (!this.data.email || !this.data.password) {
      this.setData({ error: i18n.t('err_email_pwd') });
      return false;
    }
    return true;
  },

  async _auth(fn, errKey) {
    this.setData({ loading: true, error: '' });
    try {
      const t = await fn();
      api.setSession(t);
      this._enter();
    } catch (e) {
      this.setData({ error: this._msg(e) || i18n.t(errKey) });
    } finally {
      this.setData({ loading: false });
    }
  },

  _msg(e) {
    const d = e && e.data;
    return d && (d.msg || d.error_description || d.message);
  },

  _enter() {
    const app = getApp();
    app.globalData.loggedIn = true;
    app.globalData.user = api.getSession().user;
    wx.switchTab({ url: '/pages/dashboard/dashboard' });
  },
});
