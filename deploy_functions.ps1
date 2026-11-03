# FreshTrack HK — deploy recipe-ai-chat Edge Function + set secrets
# 在已安装 Supabase CLI 的机器上运行（管理员或非管理员均可，只需有网络）。
param()

$ErrorActionPreference = 'Stop'
$REF = "cjqmeypqkxvnyojpyexw"

# ===== 填写你的密钥（留空则 AI 大厨自动回退 Gemini）=====
$SUPABASE_ACCESS_TOKEN = ""   # 控制台 Personal access token，sbp_... （或用下方 supabase login 替代）
$LLM_API_KEY     = ""         # 开源模型 key（HKBU 网关为 UUID 格式）
$LLM_BASE_URL    = "https://genai.hkbu.edu.hk/api/v1"
$LLM_MODEL       = "deepseek-v4-flash-0731"
$TAVILY_API_KEY  = ""         # 可选，开启 AI 联网搜索（web_search 工具）

# 若未填 token，则尝试用 supabase login 的本地会话
if ($SUPABASE_ACCESS_TOKEN) { $env:SUPABASE_ACCESS_TOKEN = $SUPABASE_ACCESS_TOKEN }

# 进入含 config.toml / functions 的目录
Set-Location (Join-Path $PSScriptRoot "backend/supabase")

Write-Host ">> deploying recipe-ai-chat ..." -ForegroundColor Cyan
supabase functions deploy recipe-ai-chat --project-ref $REF

# 设置 secrets（仅在对应变量非空时）
$secrets = @()
if ($LLM_API_KEY)   { $secrets += "LLM_API_KEY=$LLM_API_KEY" }
if ($LLM_BASE_URL)  { $secrets += "LLM_BASE_URL=$LLM_BASE_URL" }
if ($LLM_MODEL)     { $secrets += "LLM_MODEL=$LLM_MODEL" }
if ($TAVILY_API_KEY){ $secrets += "TAVILY_API_KEY=$TAVILY_API_KEY" }

if ($secrets.Count) {
  Write-Host ">> setting secrets ..." -ForegroundColor Cyan
  supabase secrets set --project-ref $REF ($secrets -join " ")
} else {
  Write-Host ">> 未填写任何 LLM/Tavily key，函数将以 Gemini 回退模式运行。" -ForegroundColor Yellow
}

Write-Host ">> done." -ForegroundColor Green
