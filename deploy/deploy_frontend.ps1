# Build & deploy the PUBLIC frontend service (React build + Express BFF) and
# allow its service account to call the private backend (roles/run.invoker).
# PowerShell version of deploy_frontend.sh.
#
# Usage (from the repo root):  .\deploy\deploy_frontend.ps1   [-DryRun]
param([switch]$DryRun)
. (Join-Path $PSScriptRoot 'common.ps1')

$backendUrl = Get-GcloudOutput run services describe $BackendService --project $Project --region $Region --format 'value(status.url)'
if (-not $backendUrl) {
  throw "Backend service $BackendService not found. Run .\deploy\deploy_backend.ps1 first."
}

Write-Step "Granting $WebSa permission to invoke $BackendService"
Invoke-Gcloud run services add-iam-policy-binding $BackendService `
  --project $Project --region $Region `
  --member "serviceAccount:$WebSa" --role roles/run.invoker | Out-Null

Write-Step "Deploying $FrontendService (public) -> $backendUrl"
Push-Location (Join-Path $RepoRoot 'frontend')
try {
  Invoke-Gcloud run deploy $FrontendService `
    --source . `
    --project $Project `
    --region $Region `
    --service-account $WebSa `
    --allow-unauthenticated `
    --set-env-vars "BACKEND_URL=$backendUrl,ADK_APP_NAME=$AdkAppName" `
    --timeout 3600 `
    --memory 512Mi `
    --cpu 1 `
    --min-instances 0 `
    --max-instances 5
} finally {
  Pop-Location
}

if ($DryRun) { Write-Step 'Dry run finished; nothing was deployed.'; return }
$url = Get-GcloudOutput run services describe $FrontendService --project $Project --region $Region --format 'value(status.url)'
Write-Step "Frontend deployed: $url"
