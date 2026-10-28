const api = require('../../utils/api');
const config = require('../../utils/config');

Page({
  data: { email: '', password: '', loading: false, error: '' },

  onEmail(e) { this.setData({ email: e.detail.value }); },
  onPwd(e) { this.setData({ password: e.detail.value }); },

  doLogin() {
    if (!this._valid()) return;
    this._auth(() => api.signIn(this.data.email, this.data.password));
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
      this.setData({ error: this._msg(e) || '注册失败' });
    } finally {
      this.setData({ loading: false });
    }
  },

  async enterDemo() {
    this.setData({ loading: true, error: '' });
    try {
      const t = await api.signIn(config.DEMO_EMAIL, config.DEMO_PASSWORD);
      api.setSession(t);
      this._enter();
    } catch (e) {
      this.setData({ error: 'Demo 登录失败，请确认已运行后端部署脚本（见 backend/deploy/SECRETS.md）' });
    } finally {
      this.setData({ loading: false });
    }
  },

  _valid() {
    if (!this.data.email || !this.data.password) {
      this.setData({ error: '请输入邮箱和密码' });
      return false;
    }
    return true;
  },

  async _auth(fn) {
    this.setData({ loading: true, error: '' });
    try {
      const t = await fn();
      api.setSession(t);
      this._enter();
    } catch (e) {
      this.setData({ error: this._msg(e) || '登录失败' });
    } finally {
      this.setData({ loading: false });
    }
  },

  _msg(e) {
    const d = e && e.data;
    return d && (d.msg || d.error_description || d.message);
  },

  _enter() {
    wx.switchTab({ url: '/pages/dashboard/dashboard' });
  },
});
