# Fetch tea-related headlines from Google News RSS and write news.json.
# Runs on GitHub Actions (pwsh) and locally (Windows PowerShell 5.1).
# Usage: pwsh scripts/fetch-news.ps1 [-Out news.json]
param([string]$Out = (Join-Path (Split-Path $PSScriptRoot -Parent) 'news.json'))

$ErrorActionPreference = 'Stop'
# Search keywords, built from code points so the file stays ASCII for PowerShell 5.1
function Str([int[]]$codes) { -join ($codes | ForEach-Object { [char]$_ }) }
$queries = @(
  (Str 0x7D05, 0x8336),                                                  # kocha (black tea)
  (Str 0x548C, 0x7D05, 0x8336),                                          # wakocha (Japanese black tea)
  (Str 0x30A2, 0x30D5, 0x30BF, 0x30CC, 0x30FC, 0x30F3, 0x30C6, 0x30A3, 0x30FC) # afternoon tea
)
$maxItems = 40
$maxPerQuery = 15   # keep one keyword (e.g. hotel afternoon-tea events) from crowding out the rest
$maxAgeDays = 30

$wc = New-Object System.Net.WebClient
$wc.Encoding = [System.Text.Encoding]::UTF8
$wc.Headers.Add('User-Agent', 'tea-note-news/1.0')

$seen = @{}
$items = New-Object System.Collections.ArrayList
$cutoff = (Get-Date).ToUniversalTime().AddDays(-$maxAgeDays)

foreach ($q in $queries) {
  $url = 'https://news.google.com/rss/search?q=' + [Uri]::EscapeDataString($q) + '&hl=ja&gl=JP&ceid=JP:ja'
  try {
    [xml]$rss = $wc.DownloadString($url)
  } catch {
    Write-Warning "Failed to fetch '$q': $($_.Exception.Message)"
    continue
  }
  $newest = @($rss.rss.channel.item | Sort-Object {
    try { [DateTime]::Parse([string]$_.pubDate, [Globalization.CultureInfo]::InvariantCulture) } catch { [DateTime]::MinValue }
  } -Descending)
  $taken = 0
  foreach ($it in $newest) {
    if ($taken -ge $maxPerQuery) { break }
    $source = if ($it.source) { [string]$it.source.'#text' } else { '' }
    $title = [string]$it.title
    # Google News appends " - <source>" to every title
    if ($source -and $title.EndsWith(" - $source")) { $title = $title.Substring(0, $title.Length - $source.Length - 3) }
    $key = $title.Trim()
    if (-not $key -or $seen.ContainsKey($key)) { continue }
    try { $date = [DateTime]::Parse([string]$it.pubDate, [Globalization.CultureInfo]::InvariantCulture).ToUniversalTime() }
    catch { continue }
    if ($date -lt $cutoff) { continue }
    $seen[$key] = $true
    $taken++
    [void]$items.Add([ordered]@{
      title = $key
      source = $source
      url = [string]$it.link
      publishedAt = $date.ToString('yyyy-MM-ddTHH:mm:ssZ')
      query = $q
    })
  }
}

if ($items.Count -eq 0) {
  # Keep the previous file rather than publishing an empty list after a fetch failure
  Write-Warning 'No items fetched; leaving existing news.json unchanged.'
  exit 0
}

$sorted = @($items | Sort-Object { $_.publishedAt } -Descending | Select-Object -First $maxItems)
$doc = [ordered]@{
  updatedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  source = 'Google News'
  items = $sorted
}
$json = ConvertTo-Json -InputObject $doc -Depth 5
[IO.File]::WriteAllText($Out, $json, (New-Object System.Text.UTF8Encoding $false))
Write-Host "Wrote $($sorted.Count) items to $Out"
