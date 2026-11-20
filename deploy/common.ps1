# Shared configuration for the PowerShell deploy scripts (Windows PowerShell 5.1
# or PowerShell 7). Mirrors common.sh: values come from the repo's .env (see
# Project_Steps.md); settings that are not in .env can also come from
# environment variables, e.g.  $env:BACKEND_SERVICE = "my-api".
#
# Dot-sourced by the other deploy/*.ps1 scripts; not meant to be run directly.
# Each script accepts -DryRun: read-only gcloud calls still run, and every
# command that would change something is printed instead of executed.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not (Get-Variable -Name DryRun -Scope Script -ErrorAction SilentlyContinue)) { $DryRun = $false }

# --- .env ---------------------------------------------------------------------
# KEY=VALUE lines; "export KEY=VALUE", quoted values and # comments are allowed.
# Values are kept in $DotEnv (not exported), so secrets never reach the
# PowerShell session's environment.
$DotEnv = @{}
$envPath = Join-Path $RepoRoot '.env'
if (Test-Path $envPath) {
  foreach ($line in [IO.File]::ReadAllLines($envPath)) {
    if ($line -notmatch '^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') { continue }
    $key = $Matches[1]; $value = $Matches[2]
    if ($value -match '^"(.*)"$' -or $value -match "^'(.*)'$") { $value = $Matches[1] }
    else { $value = $value -replace '\s+#.*$', '' }
    $DotEnv[$key] = $value
  }
}

# .env first, then the process environment, then the default (same order as common.sh).
function Get-Setting([string]$Name, [string]$Default = '') {
  if ($DotEnv.ContainsKey($Name) -and $DotEnv[$Name]) { return $DotEnv[$Name] }
  $fromEnv = [Environment]::GetEnvironmentVariable($Name)
  if ($fromEnv) { return $fromEnv }
  return $Default
}

function Get-RequiredSetting([string]$Name, [string]$Hint) {
  $value = Get-Setting $Name
  if (-not $value) { throw "$Name is not set. $Hint" }
  return $value
}

function Write-Step([string]$Message) {
  Write-Host ''
  Write-Host "==> $Message" -ForegroundColor Cyan
}

# --- gcloud helpers -----------------------------------------------------------
# Windows PowerShell 5.1 mangles double quotes inside native-command arguments,
# so the scripts never pass arguments that contain them (filters with quotes go
# through files instead).

# Runs gcloud and stops the script if it fails. With -DryRun it only prints the command.
function Invoke-Gcloud {
  $ErrorActionPreference = 'Continue'
  if ($DryRun) {
    Write-Host ("DRY RUN: gcloud " + ($args -join ' ')) -ForegroundColor Yellow
    return
  }
  & gcloud @args
  if ($LASTEXITCODE -ne 0) { throw "gcloud $($args[0]) $($args[1]) failed (exit code $LASTEXITCODE)." }
}

# Runs a read-only gcloud command and returns its output as one trimmed string,
# or $null if it fails (errors are suppressed). Runs even with -DryRun.
function Get-GcloudOutput {
  $ErrorActionPreference = 'Continue'
  $out = & gcloud @args 2>$null
  if ($LASTEXITCODE -ne 0) { return $null }
  return (($out | Out-String).Trim())
}

# True when a read-only gcloud command succeeds (used for "does it exist?" checks).
function Test-Gcloud {
  return ($null -ne (Get-GcloudOutput @args))
}

# Writes text as UTF-8 without a byte-order mark (gcloud and YAML parsers expect that).
function Write-Utf8File([string]$Path, [string]$Text) {
  [IO.File]::WriteAllText($Path, $Text, (New-Object Text.UTF8Encoding $false))
}

# --- configuration (same names and defaults as common.sh) ----------------------
$Project = Get-RequiredSetting 'GOOGLE_CLOUD_PROJECT' 'Set GOOGLE_CLOUD_PROJECT in .env'
$Region = Get-RequiredSetting 'REGION' 'Set REGION in .env (Cloud Run + Cloud SQL region, e.g. asia-south1)'

$BackendService = Get-Setting 'BACKEND_SERVICE' 'doctor-appointment-api'
$FrontendService = Get-Setting 'FRONTEND_SERVICE' 'doctor-appointment-web'
$DbInstance = Get-Setting 'DB_INSTANCE' 'doctor-db'
$SessionDbName = Get-Setting 'SESSION_DB_NAME' 'adk_sessions'
# Patient accounts, login sessions, consultation logs and appointments
$AppDbName = Get-Setting 'APP_DB_NAME' 'careconnect_app'
$AdkAppName = Get-Setting 'ADK_APP_NAME' 'agents'
$InstanceConnectionName = Get-Setting 'INSTANCE_CONNECTION_NAME' "${Project}:${Region}:${DbInstance}"
$AgentSa = Get-Setting 'AGENT_SA' "agent-sa@$Project.iam.gserviceaccount.com"
$WebSaName = Get-Setting 'WEB_SA_NAME' 'web-sa'
$WebSa = "$WebSaName@$Project.iam.gserviceaccount.com"

# Secret Manager secret names
$SecretDbPassword = Get-Setting 'SECRET_DB_PASSWORD' 'db-password'
$SecretComposioApiKey = Get-Setting 'SECRET_COMPOSIO_API_KEY' 'composio-api-key'
$SecretMapsApiKey = Get-Setting 'SECRET_MAPS_API_KEY' 'maps-api-key'
# Google AI Studio (Gemini API) key, used when GOOGLE_GENAI_USE_VERTEXAI=false
$SecretGeminiApiKey = Get-Setting 'SECRET_GEMINI_API_KEY' 'gemini-api-key'

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  throw 'gcloud was not found. Install the Google Cloud CLI and run "gcloud auth login".'
}
