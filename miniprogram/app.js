const api = require('./utils/api');

App({
  globalData: {
    loggedIn: false,
    user: null,
    householdId: null,
  },
  onLaunch() {
    const s = api.getSession();
    if (s.access_token && s.user) {
      this.globalData.loggedIn = true;
      this.globalData.user = s.user;
    }
  },
});
