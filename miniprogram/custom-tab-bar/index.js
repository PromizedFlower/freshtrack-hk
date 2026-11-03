const i18n = require('../utils/i18n');

Component({
  data: {
    active: '',
    theme: 'light',
    labels: {},
    // "add" is placed in the middle slot and rendered as a raised primary button.
    items: [
      { path: '/pages/dashboard/dashboard', key: 'tab_home', icon: '🏠' },
      { path: '/pages/fridge/fridge', key: 'tab_fridge', icon: '🧊' },
      { path: '/pages/add/add', key: 'tab_add', icon: '＋', center: true },
      { path: '/pages/recipes/recipes', key: 'tab_recipes', icon: '🍳' },
      { path: '/pages/impact/impact', key: 'tab_me', icon: '👤' },
    ],
  },

  lifetimes: {
    attached() { this.refresh(); },
  },

  pageLifetimes: {
    show() { this.refresh(); },
  },

  methods: {
    refresh() {
      const labels = {};
      this.data.items.forEach((it) => { labels[it.key] = i18n.t(it.key); });
      let active = '';
      const pages = getCurrentPages();
      const cur = pages[pages.length - 1];
      if (cur && cur.route) active = '/' + cur.route;
      this.setData({ labels, theme: i18n.getTheme(), active });
    },

    onTap(e) {
      const path = e.currentTarget.dataset.path;
      if (path && path !== this.data.active) {
        wx.switchTab({ url: path });
      }
    },
  },
});
