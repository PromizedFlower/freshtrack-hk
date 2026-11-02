// FreshTrack HK — lightweight i18n + preferences store (no external deps).
// Language / theme / font scale are persisted in storage and applied globally.

const LANG_KEY = 'ft_lang';
const THEME_KEY = 'ft_theme';
const FONT_KEY = 'ft_font';

const dict = {
  zh: {
    // common
    loading: '加载中…',
    noData: '暂无数据，请先在「添加」页录入食材',
    save: '保存', cancel: '取消', done: '完成', retry: '重试',
    // tabs
    tab_home: '首页', tab_fridge: '冰箱', tab_recipes: '菜谱', tab_add: '添加', tab_me: '我的',
    // dashboard / scheme C
    morning: '晨曦', afternoon: '午后', night: '墨夜',
    greeting_morning: '早安', greeting_afternoon: '午安', greeting_night: '晚上好',
    hero_sub_expiring: '雪柜中有 {n} 件食材即将过期，{m} 件正在开封食用。',
    kpi_in_fridge: '在库食材', kpi_expiring: '临期', kpi_in_use: '食用中',
    zone_fridge: '冷藏', zone_freezer: '冷冻', zone_pantry: '常温',
    zone_fridge_desc: '4°C · 乳品/熟食', zone_freezer_desc: '-18°C · 肉类/急冻', zone_pantry_desc: '常温 · 干货/蔬果',
    swipe_tip_consume: '右滑吃完 ✓', swipe_tip_edit: '点击 ⋯ 换层编辑', swipe_tip_discard: '左滑丢弃 🗑️',
    today_expiring_top: '今日临期 Top',
    quick_add: '添加食材', quick_recipes: '抢救菜谱', quick_impact: '减废成果',
    // fridge
    fridge_title: '三温区雪柜视图',
    empty_zone: '此温区暂无食材',
    edit_item: '编辑食材与调整温区',
    label_name: '食材名称', label_expiry: '到期日期', label_date_type: '日期类型', label_zone: '存放温区',
    consumed: '吃完消化', discard: '过期丢弃',
    confirm_consume: '确认「{name}」已用完 / 已下厨？将计入惜食减废。',
    confirm_discard: '确认「{name}」已过期丢弃？',
    // add
    mode_receipt: '小票扫描', mode_food: '食材拍照', mode_manual: '手动录入',
    scan_receipt: '拍摄超市小票', scan_food: '拍摄食材 / 喷码', scanning: '识别中…',
    detected: '识别结果', confirm_add: '确认入库', nothing_detected: '未识别到食材',
    scan_failed: '识别失败，请重试', read_failed: '读取图片失败',
    add_title: '新增生鲜入库',
    cat_title: '1. 选择类别图标',
    cat_veg: '蔬菜', cat_fruit: '水果', cat_meat: '肉类', cat_seafood: '海鲜',
    cat_dairy: '乳品/蛋', cat_bakery: '烘焙', cat_frozen: '急冻', cat_other: '其他',
    add_name_ph: '例如：日本产温室小青瓜',
    add_days: '保鲜天数', add_zone: '存放温区', add_price: '购买金额 (HK$，选填)',
    add_save: '存入雪柜', add_saved: '已入库',
    // recipes
    recipe_explore: '探索灵感', recipe_chef: '港式 AI 私厨',
    ai_tonight: '今晚怎么煮', ai_ask: '问 AI', ai_placeholder: '例如：鸡胸+菜心，10 分钟能做什么',
    ai_generating: '生成中…', ai_failed: 'AI 生成失败，已回退本地菜谱', ai_unavailable: 'AI 暂时不可用',
    preset_1: '帮我清空快过期的菠菜与鸡胸肉',
    preset_2: '15分钟电饭煲懒人快手菜推荐',
    preset_3: '食谱要白葡萄酒，用家里花雕酒怎么替换？',
    weekly_rescue: '本周抢救清单', no_recipe: '暂无推荐菜谱',
    fav: '收藏', cook: '下厨', detail: '详情', collapse: '收起',
    fav_ok: '已收藏', fav_fail: '收藏失败',
    cook_title: '开始下厨', cook_confirm: '将核销 {n} 项食材并计入惜食减废。',
    no_match: '没有匹配的可核销食材',
    // me / impact
    me_sdg: '减废成果 (SDG 12.3)', me_sdg_sub: '减少食物浪费 · 减缓气候变化',
    me_month_kg: '本月惜食', me_month_hkd: '节省开支', me_month_co2: '减排 CO₂e',
    me_trend: '近 6 月惜食趋势', stat_tracked: '当前跟踪食材', stat_expiring: '临期 (高风险)',
    me_restock: '待买补货清单', me_restock_add: '+ 新增待买', me_restock_empty: '清单空空如也，点右上角新增吧',
    me_restock_bought: '已买', me_restock_cancel: '取消',
    me_prefs: '偏好与无障碍设置',
    pref_lang: '界面语言', pref_theme: '外观主题', pref_font: '长辈大字',
    pref_zh: '繁体中文', pref_en: 'English',
    pref_light: '暖纸', pref_dark: '深黑',
    pref_font_100: '100%', pref_font_125: '125%',
    // risk / date type labels
    risk_high: '高风险', risk_medium: '中风险', risk_low: '低风险',
    type_best_before: '最佳赏味期', type_use_by: '此日期前食用',
    days_left: '剩 {n} 天',
    // login
    login_tagline: '惜食减废 · 智能冰箱管理',
    login_email_ph: '邮箱', login_pwd_ph: '密码',
    login_btn: '登录', signup_btn: '注册新账号',
    login_demo_title: '一键体验测试账号',
    login_demo_sub: '5 个账号 · 同一家庭不同角色',
    err_email_pwd: '请输入邮箱和密码', err_login: '登录失败', err_signup: '注册失败',
    err_demo: '演示账号登录失败，请确认后端已部署',
    // profile (Me tab)
    sign_out: '退出登录',
    role_owner: '拥有者', role_editor: '编辑者', role_viewer: '访客',
    profile_household: '家庭', profile_no_household: '尚未加入家庭',
  },
  en: {
    loading: 'Loading…',
    noData: 'No data yet. Add items in the "Add" tab.',
    save: 'Save', cancel: 'Cancel', done: 'Done', retry: 'Retry',
    tab_home: 'Home', tab_fridge: 'Fridge', tab_recipes: 'Recipes', tab_add: 'Add', tab_me: 'Me',
    morning: 'Dawn', afternoon: 'Afternoon', night: 'Night',
    greeting_morning: 'Good morning', greeting_afternoon: 'Good afternoon', greeting_night: 'Good evening',
    hero_sub_expiring: '{n} items are expiring soon, {m} opened & in use.',
    kpi_in_fridge: 'In fridge', kpi_expiring: 'Expiring', kpi_in_use: 'In use',
    zone_fridge: 'Chilled', zone_freezer: 'Freezer', zone_pantry: 'Pantry',
    zone_fridge_desc: '4°C · Dairy/Deli', zone_freezer_desc: '-18°C · Meat/Frozen', zone_pantry_desc: 'Ambient · Dry/Produce',
    swipe_tip_consume: 'Swipe right: eaten ✓', swipe_tip_edit: 'Tap ⋯ to move/edit', swipe_tip_discard: 'Swipe left: discard 🗑️',
    today_expiring_top: 'Expiring soon',
    quick_add: 'Add item', quick_recipes: 'Rescue recipes', quick_impact: 'My impact',
    fridge_title: 'Three-zone fridge',
    empty_zone: 'Nothing in this zone',
    edit_item: 'Edit item & move zone',
    label_name: 'Name', label_expiry: 'Expiry date', label_date_type: 'Date type', label_zone: 'Zone',
    consumed: 'Eaten', discard: 'Discard',
    confirm_consume: 'Mark "{name}" as used / cooked? Counts as food saved.',
    confirm_discard: 'Discard "{name}" as expired?',
    mode_receipt: 'Receipt scan', mode_food: 'Food photo', mode_manual: 'Manual',
    scan_receipt: 'Scan receipt', scan_food: 'Snap food / label', scanning: 'Scanning…',
    detected: 'Detected', confirm_add: 'Confirm', nothing_detected: 'Nothing detected',
    scan_failed: 'Scan failed, retry', read_failed: 'Read image failed',
    add_title: 'Add fresh item',
    cat_title: '1. Pick a category',
    cat_veg: 'Vegetable', cat_fruit: 'Fruit', cat_meat: 'Meat', cat_seafood: 'Seafood',
    cat_dairy: 'Dairy/Egg', cat_bakery: 'Bakery', cat_frozen: 'Frozen', cat_other: 'Other',
    add_name_ph: 'e.g. Japanese cucumber',
    add_days: 'Fresh for (days)', add_zone: 'Storage zone', add_price: 'Price (HK$, optional)',
    add_save: 'Save to fridge', add_saved: 'Saved',
    recipe_explore: 'Explore', recipe_chef: 'AI Chef',
    ai_tonight: "What's for dinner?", ai_ask: 'Ask AI', ai_placeholder: 'e.g. chicken breast + choy sum in 10 min',
    ai_generating: 'Cooking up…', ai_failed: 'AI failed, showing local recipes', ai_unavailable: 'AI unavailable',
    preset_1: 'Clear my expiring spinach & chicken breast',
    preset_2: '15-min rice-cooker quick meals',
    preset_3: 'Substitute white wine with Shaoxing wine?',
    weekly_rescue: 'This week\'s rescue', no_recipe: 'No recipes yet',
    fav: 'Save', cook: 'Cook', detail: 'Detail', collapse: 'Hide',
    fav_ok: 'Saved', fav_fail: 'Save failed',
    cook_title: 'Start cooking', cook_confirm: 'This will consume {n} item(s) and count as food saved.',
    no_match: 'No matching items to consume',
    me_sdg: 'Waste saved (SDG 12.3)', me_sdg_sub: 'Less food waste · slower climate change',
    me_month_kg: 'Saved this month', me_month_hkd: 'Money saved', me_month_co2: 'CO₂e avoided',
    me_trend: '6-month trend', stat_tracked: 'Tracked items', stat_expiring: 'Expiring (high)',
    me_restock: 'To-buy restock list', me_restock_add: '+ Add', me_restock_empty: 'List is empty — add with the top-right button',
    me_restock_bought: 'Bought', me_restock_cancel: 'Cancel',
    me_prefs: 'Preferences & accessibility',
    pref_lang: 'Language', pref_theme: 'Theme', pref_font: 'Font scale',
    pref_zh: '繁體中文', pref_en: 'English',
    pref_light: 'Light', pref_dark: 'Dark',
    pref_font_100: '100%', pref_font_125: '125%',
    risk_high: 'High risk', risk_medium: 'Medium risk', risk_low: 'Low risk',
    type_best_before: 'Best before', type_use_by: 'Use by',
    days_left: '{n} days left',
    login_tagline: 'Save food, waste less · Smart fridge',
    login_email_ph: 'Email', login_pwd_ph: 'Password',
    login_btn: 'Sign in', signup_btn: 'Create account',
    login_demo_title: 'One-tap demo sign-in',
    login_demo_sub: '5 accounts · one household, different roles',
    err_email_pwd: 'Enter email and password', err_login: 'Sign in failed', err_signup: 'Sign up failed',
    err_demo: 'Demo sign-in failed. Check backend deployment.',
    sign_out: 'Sign out',
    role_owner: 'Owner', role_editor: 'Editor', role_viewer: 'Viewer',
    profile_household: 'Household', profile_no_household: 'No household yet',
  },
};

function getLang() {
  const l = wx.getStorageSync(LANG_KEY);
  return l === 'en' ? 'en' : 'zh';
}
function setLang(lang) {
  wx.setStorageSync(LANG_KEY, lang);
}
function getTheme() {
  return wx.getStorageSync(THEME_KEY) === 'dark' ? 'dark' : 'light';
}
function setTheme(theme) {
  wx.setStorageSync(THEME_KEY, theme);
}
function getFont() {
  return wx.getStorageSync(FONT_KEY) === 'large' ? 'large' : 'normal';
}
function setFont(font) {
  wx.setStorageSync(FONT_KEY, font);
}

function t(key, vars) {
  const lang = getLang();
  let s = (dict[lang] && dict[lang][key]) || dict.zh[key] || key;
  if (vars) {
    Object.keys(vars).forEach((k) => { s = s.split('{' + k + '}').join(vars[k]); });
  }
  return s;
}

// ---- domain label maps (bilingual) ----
const CATEGORY_META = {
  Produce: { zh: '蔬果', en: 'Produce', icon: '🥬' },
  Dairy: { zh: '乳品/蛋', en: 'Dairy', icon: '🥛' },
  Meat: { zh: '肉类', en: 'Meat', icon: '🥩' },
  Bakery: { zh: '烘焙', en: 'Bakery', icon: '🍞' },
  Pantry: { zh: '干货/其他', en: 'Pantry', icon: '📦' },
};
const ZONE_META = {
  fridge: { zh: '冷藏', en: 'Chilled', icon: '🧊', temp: '4°C' },
  freezer: { zh: '冷冻', en: 'Freezer', icon: '❄️', temp: '-18°C' },
  pantry: { zh: '常温', en: 'Pantry', icon: '🗄️', temp: '—' },
};
const RISK_META = { high: 'risk_high', medium: 'risk_medium', low: 'risk_low' };
const TYPE_META = { best_before: 'type_best_before', use_by: 'type_use_by' };

// 8-icon picker -> backend category (v4 visuals merged into the 5 backend categories).
const PICKER_CATS = [
  { icon: '🥬', name: 'cat_veg', category: 'Produce' },
  { icon: '🍎', name: 'cat_fruit', category: 'Produce' },
  { icon: '🥩', name: 'cat_meat', category: 'Meat' },
  { icon: '🐟', name: 'cat_seafood', category: 'Meat' },
  { icon: '🥛', name: 'cat_dairy', category: 'Dairy' },
  { icon: '🍞', name: 'cat_bakery', category: 'Bakery' },
  { icon: '🥟', name: 'cat_frozen', category: 'Meat' },
  { icon: '📦', name: 'cat_other', category: 'Pantry' },
];

function catLabel(category) {
  const m = CATEGORY_META[category] || { zh: category, en: category, icon: '📦' };
  const lang = getLang();
  return lang === 'en' ? m.en : m.zh;
}
function catIcon(category) {
  return (CATEGORY_META[category] || {}).icon || '📦';
}
function zoneLabel(zone) {
  const m = ZONE_META[zone] || { zh: zone, en: zone, icon: '🗄️', temp: '' };
  const lang = getLang();
  return lang === 'en' ? m.en : m.zh;
}
function zoneIcon(zone) { return (ZONE_META[zone] || {}).icon || '🗄️'; }
function riskLabel(level) { return t(RISK_META[level] || level); }
function typeLabel(dt) { return t(TYPE_META[dt] || dt); }
function roleLabel(role) {
  const key = (role === 'owner' || role === 'editor' || role === 'viewer') ? 'role_' + role : 'role_editor';
  return t(key);
}

module.exports = {
  getLang, setLang, getTheme, setTheme, getFont, setFont, t,
  CATEGORY_META, ZONE_META, PICKER_CATS,
  catLabel, catIcon, zoneLabel, zoneIcon, riskLabel, typeLabel, roleLabel,
};
