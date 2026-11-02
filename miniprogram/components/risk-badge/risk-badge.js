const i18n = require('../../utils/i18n');

Component({
  properties: {
    level: { type: String, value: 'low' },
  },
  data: { label: '' },
  observers: {
    level(level) {
      this.setData({ label: i18n.riskLabel(level) });
    },
  },
});
