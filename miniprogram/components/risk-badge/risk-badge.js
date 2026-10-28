Component({
  properties: {
    level: { type: String, value: 'low' },
  },
  data: { label: '' },
  observers: {
    level(level) {
      const map = { high: '高风险', medium: '中风险', low: '低风险' };
      this.setData({ label: map[level] || level });
    },
  },
});
