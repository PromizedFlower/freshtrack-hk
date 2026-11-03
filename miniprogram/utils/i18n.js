// FreshTrack HK — lightweight i18n + preferences store (no external deps).
// 繁體中文（zh-HK）為唯一介面語言；theme / font scale 持久化於 storage 並全域套用。

const THEME_KEY = 'ft_theme';
const FONT_KEY = 'ft_font';

const dict = {
  zh: {
    // common
    loading: '載入中…',
    noData: '暫無數據，請先在「添加」頁錄入食材',
    save: '儲存', cancel: '取消', done: '完成', retry: '重試',
    // tabs
    tab_home: '首頁', tab_fridge: '雪櫃', tab_recipes: '食譜', tab_add: '添加', tab_me: '我的',
    // dashboard / scheme C
    morning: '晨曦', afternoon: '午後', night: '夜幕',
    greeting_morning: '早安', greeting_afternoon: '午安', greeting_night: '晚上好',
    hero_sub_expiring: '雪櫃中有 {n} 件食材即將過期，{m} 件正在開封食用。',
    kpi_in_fridge: '在庫食材', kpi_expiring: '臨期', kpi_in_use: '食用中',
    zone_fridge: '冷藏', zone_freezer: '冷凍', zone_pantry: '常溫',
    zone_fridge_desc: '4°C · 乳品/熟食', zone_freezer_desc: '-18°C · 肉類/急凍', zone_pantry_desc: '常溫 · 乾貨/蔬果',
    today_expiring_top: '今日臨期 Top',
    quick_add: '添加食材', quick_recipes: '搶救食譜', quick_impact: '減廢成果',
    // fridge
    fridge_title: '三溫區雪櫃視圖',
    empty_zone: '此溫區暫無食材',
    edit_item: '編輯食材與調整溫區',
    label_name: '食材名稱', label_expiry: '到期日期', label_date_type: '日期類型', label_zone: '存放溫區',
    consumed: '吃完消化', discard: '過期丟棄',
    fx_consumed: '已計入惜食 ✓', fx_discarded: '已記錄丟棄',
    // （舊的 confirm_consume / confirm_discard 已隨二次確認彈窗一併移除）
    // add
    mode_receipt: '小票掃描', mode_food: '食材拍照', mode_manual: '手動錄入',
    scan_receipt: '拍攝超市小票', scan_food: '拍攝食材／噴碼', scanning: '識別中…',
    detected: '識別結果', confirm_add: '確認入庫', nothing_detected: '未識別到食材',
    scan_failed: '識別失敗，請重試', read_failed: '讀取圖片失敗',
    add_title: '新增生鮮入庫',
    cat_title: '1. 選擇類別圖標',
    cat_veg: '蔬菜', cat_fruit: '水果', cat_meat: '肉類', cat_seafood: '海鮮',
    cat_dairy: '乳品/蛋', cat_bakery: '烘焙', cat_frozen: '急凍', cat_other: '其他',
    add_name_ph: '例如：日本產溫室小青瓜',
    add_days: '保鮮天數', add_zone: '存放溫區', add_price: '購買金額 (HK$，選填)',
    add_save: '存入雪櫃', add_saved: '已入庫',
    // recipes
    recipe_explore: '探索靈感', recipe_chef: '港式 AI 私廚',
    ai_tonight: '今晚怎麼煮', ai_ask: '問 AI', ai_placeholder: '例如：雞胸＋菜心，10 分鐘能做什麼',
    ai_generating: '生成中…', ai_failed: 'AI 生成失敗，已回退本地食譜', ai_unavailable: 'AI 暫時不可用',
    preset_1: '幫我清空快過期的菠菜與雞胸肉',
    preset_2: '15 分鐘電飯煲懶人快手菜推薦',
    preset_3: '食譜要白葡萄酒，用家裡花雕酒怎麼替換？',
    weekly_rescue: '本週搶救清單', no_recipe: '暫無推薦食譜',
    matched_with: '用到', recipe_empty_hint: '雪櫃裡還沒有可匹配的食材，先去「添加」錄入吧',
    my_recipes: '我的食譜', record_add: '記錄食譜', record_title: '食譜名稱', record_note: '備註（可選）',
    record_saved: '已記錄', record_fail: '儲存失敗', record_name_required: '請填寫食譜名稱',
    recipe_deleted: '已刪除', delete_recipe: '刪除',
    record_empty_hint: '還沒有自己的食譜，點右上角「記錄食譜」吧',
    fav: '收藏', cook: '下廚', detail: '詳情', collapse: '收起',
    fav_ok: '已收藏', fav_fail: '收藏失敗',
    cook_title: '開始下廚', cook_confirm: '將核銷 {n} 項食材並計入惜食減廢。',
    no_match: '沒有匹配的可核銷食材',
    // me / impact
    me_sdg: '減廢成果 (SDG 12.3)', me_sdg_sub: '減少食物浪費 · 減緩氣候變化',
    me_month_kg: '本月惜食', me_month_hkd: '節省開支', me_month_co2: '減排 CO₂e',
    me_trend: '近 6 月惜食趨勢', stat_tracked: '當前追蹤食材', stat_expiring: '臨期 (高風險)',
    me_restock: '代購清單', me_restock_add: '加入代購', me_restock_empty: '還沒有代購需求，點右上角「加入代購」吧',
    me_restock_bought: '已買', me_restock_cancel: '取消',
    restock_name_ph: '例如：雞蛋 1 盒', restock_qty: '數量', restock_cat: '選擇圖標',
    restock_name_required: '請先填寫名稱', restock_added: '已加入代購', restock_fail: '操作失敗，請重試',
    me_prefs: '偏好與無障礙設定',
    pref_theme: '外觀主題', pref_font: '長輩大字',
    pref_light: '暖紙', pref_dark: '深黑',
    pref_font_100: '100%', pref_font_125: '125%',
    // risk / date type labels
    risk_high: '高風險', risk_medium: '中風險', risk_low: '低風險',
    type_best_before: '最佳賞味期', type_use_by: '此日期前食用',
    days_left: '剩 {n} 天',
    // login
    login_tagline: '惜食減廢 · 智能雪櫃管理',
    login_email_ph: '郵箱', login_pwd_ph: '密碼',
    login_btn: '登入', signup_btn: '註冊新帳號',
    login_demo_title: '一鍵體驗測試帳號',
    login_demo_sub: '5 個帳號 · 同一家庭不同角色',
    err_email_pwd: '請輸入郵箱和密碼', err_login: '登入失敗', err_signup: '註冊失敗',
    err_demo: '演示帳號登入失敗，請確認後端已部署',
    // profile (Me tab)
    sign_out: '退出登入', sign_out_confirm: '確定要退出當前帳號嗎？',
    role_owner: '擁有者', role_editor: '編輯者', role_viewer: '訪客',
    profile_household: '家庭', profile_no_household: '尚未加入家庭',
    family_title: '我的家庭',
    family_members: '{n} 位成員',
    invite_code: '邀請碼', copy: '複製', copied: '邀請碼已複製',
    self_tag: '我',
    family_switch: '切換家庭', family_join: '加入家庭', family_leave: '離開家庭',
    switch_title: '切換家庭', join_code_ph: '輸入家庭邀請碼', join_btn: '加入',
    joined_ok: '已加入 {name}', join_fail: '加入失敗，邀請碼無效',
    leave_confirm: '確定離開「{name}」嗎？', left_ok: '已離開', leave_fail: '離開失敗',
    current: '當前',
    manage_members: '管理成員', transfer_owner: '轉讓擁有者', remove_member: '移除',
    transfer_confirm: '確定把家庭擁有者轉讓給「{name}」？你將變為編輯者。',
    remove_confirm: '確定將「{name}」移出家庭？',
    transferred: '已轉讓擁有者', removed: '已移除', manage_fail: '操作失敗',
  },
};

function getLang() {
  return 'zh'; // 繁體中文為唯一介面語言
}
function setLang() { /* 已移除多語言切換，保留空實作以兼容舊調用 */ }
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
  let s = dict.zh[key] || key;
  if (vars) {
    Object.keys(vars).forEach((k) => { s = s.split('{' + k + '}').join(vars[k]); });
  }
  return s;
}

// ---- domain label maps (Traditional Chinese only) ----
const CATEGORY_META = {
  Produce: { zh: '蔬果', icon: '🥬' },
  Dairy: { zh: '乳品/蛋', icon: '🥛' },
  Meat: { zh: '肉類', icon: '🥩' },
  Bakery: { zh: '烘焙', icon: '🍞' },
  Pantry: { zh: '乾貨/其他', icon: '📦' },
};
const ZONE_META = {
  fridge: { zh: '冷藏', icon: '🧊', temp: '4°C' },
  freezer: { zh: '冷凍', icon: '❄️', temp: '-18°C' },
  pantry: { zh: '常溫', icon: '🗄️', temp: '—' },
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
  const m = CATEGORY_META[category] || { zh: category, icon: '📦' };
  return m.zh;
}
function catIcon(category) {
  return (CATEGORY_META[category] || {}).icon || '📦';
}
function zoneLabel(zone) {
  const m = ZONE_META[zone] || { zh: zone, icon: '🗄️', temp: '' };
  return m.zh;
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
