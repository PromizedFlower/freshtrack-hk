const api = require('./utils/api');
const i18n = require('./utils/i18n');

App({
  globalData: {
    loggedIn: false,
    user: null,
    householdId: null,
    lang: 'zh',
    theme: 'light',
    font: 'normal',
  },

  onLaunch() {
    const s = api.getSession();
    if (s.access_token && s.user) {
      this.globalData.loggedIn = true;
      this.globalData.user = s.user;
    }
    this.globalData.lang = i18n.getLang();
    this.globalData.theme = i18n.getTheme();
    this.globalData.font = i18n.getFont();
    try { this.applyPrefs(); } catch (e) { /* tab bar not ready yet */ }
  },

  // Re-apply language + theme to native chrome (nav bar + tab bar).
  applyPrefs() {
    const { lang, theme } = this.globalData;
    const dark = theme === 'dark';

    // Navigation bar
    wx.setNavigationBarColor({
      frontColor: dark ? '#ffffff' : '#ffffff',
      backgroundColor: dark ? '#121816' : '#0B3B2E',
    });
    wx.setBackgroundColor({ backgroundColor: dark ? '#121816' : '#F4F7F4' });
    wx.setBackgroundTextStyle({ textStyle: dark ? 'light' : 'dark' });
    // Custom tabBar handles its own labels/colors (see /custom-tab-bar).
  },
});
