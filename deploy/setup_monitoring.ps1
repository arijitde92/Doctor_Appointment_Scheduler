# Cloud Monitoring for the agents (safe to re-run). PowerShell version of
# setup_monitoring.sh; it does not need Python.
#   - log-based metric `consultations_started`: one per new ADK session, i.e.
#     each "New consultation" in the UI once its first message is sent
#     (counts from the moment the metric is created; no backfill)
#   - dashboard "Doctor Appointment Scheduler - Agents and LLM" from
#     deploy/monitoring/dashboard.json (token usage, LLM / agent / tool latency)
#
# The ADK metrics themselves come from the backend (METRICS_TO_CLOUD=true, set
# by deploy_backend.ps1; agent-sa needs roles/monitoring.metricWriter, granted by
# setup_gcp.ps1).
#
# Usage (from the repo root):  .\deploy\setup_monitoring.ps1   [-DryRun]
param([switch]$DryRun)
. (Join-Path $PSScriptRoot 'common.ps1')

$LogMetric = 'consultations_started'
$LogFilter = "resource.type=`"cloud_run_revision`" AND resource.labels.service_name=`"$BackendService`" AND textPayload:`"New session created`""
$DashboardSrc = Join-Path $RepoRoot 'deploy\monitoring\dashboard.json'

$metricFile = [IO.Path]::GetTempFileName()
$rendered = [IO.Path]::GetTempFileName()
try {
  # The filter contains double quotes, so it goes to gcloud in a config file
  # (JSON is valid YAML) rather than as a command-line argument.
  $metric = [ordered]@{
    name        = $LogMetric
    description = "New consultations (ADK sessions created) in $BackendService"
    filter      = $LogFilter
  }
  Write-Utf8File $metricFile ($metric | ConvertTo-Json)

  Write-Step "Log-based metric $LogMetric"
  if (Test-Gcloud logging metrics describe $LogMetric --project $Project) {
    Invoke-Gcloud logging metrics update $LogMetric --project $Project "--config-from-file=$metricFile" | Out-Null
    Write-Host 'Updated.'
  } else {
    Invoke-Gcloud logging metrics create $LogMetric --project $Project "--config-from-file=$metricFile" | Out-Null
    Write-Host 'Created.'
  }

  $config = [IO.File]::ReadAllText($DashboardSrc).Replace('__SERVICE__', $BackendService)
  $displayName = ($config | ConvertFrom-Json).displayName

  Write-Step "Dashboard `"$displayName`""
  # Filtering here instead of with --filter keeps quotes out of the arguments.
  $listJson = Get-GcloudOutput monitoring dashboards list --project $Project --format 'json(name,displayName)'
  if ($null -eq $listJson) { throw 'Could not list Cloud Monitoring dashboards.' }
  $dashboards = $listJson | ConvertFrom-Json
  $existing = @($dashboards | Where-Object { $_.displayName -eq $displayName } | Select-Object -First 1)

  if ($existing.Count -gt 0) {
    $dashboard = $existing[0].name
    # Updates need the current etag in the config.
    $etag = Get-GcloudOutput monitoring dashboards describe $dashboard --project $Project --format 'value(etag)'
    $config = ([regex]'\{').Replace($config, "{`"etag`": `"$etag`", ", 1)
    Write-Utf8File $rendered $config
    Invoke-Gcloud monitoring dashboards update $dashboard --project $Project --config-from-file $rendered | Out-Null
    Write-Host 'Updated.'
  } else {
    Write-Utf8File $rendered $config
    $dashboard = [string](Invoke-Gcloud monitoring dashboards create --project $Project --config-from-file $rendered --format 'value(name)')
    if ($DryRun) { $dashboard = 'NEW' }
    Write-Host 'Created.'
  }
} finally {
  Remove-Item -LiteralPath $metricFile, $rendered -Force -ErrorAction SilentlyContinue
}

Write-Step "Done: https://console.cloud.google.com/monitoring/dashboards/builder/$($dashboard.Split('/')[-1])?project=$Project"
