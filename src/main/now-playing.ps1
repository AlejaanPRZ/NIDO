# Puente con los controles multimedia de Windows (GlobalSystemMediaTransportControls).
# Lo lanza el proceso principal con Windows PowerShell 5.1 (el que sabe usar WinRT).
#
# Salida (stdout, una línea JSON por mensaje):
#   {"type":"state","sessions":[...]}        solo cuando algo cambia
#   {"type":"thumb","key":"...","data":"..."} carátula en base64, una vez por pista
#   {"type":"error","message":"..."}
# Entrada (stdin, una orden JSON por línea):
#   {"cmd":"toggle|next|prev|seek|shuffle|repeat","id":"<SourceAppUserModelId>","value":...}
#   seek: segundos · shuffle: true/false · repeat: None|Track|List
# Si stdin se cierra (Nido terminó), el script sale.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Emit($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress -Depth 6))
  [Console]::Out.Flush()
}

try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
  $null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
  $null = [Windows.Storage.Streams.IInputStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
  $null = [Windows.Media.MediaPlaybackAutoRepeatMode, Windows.Media, ContentType = WindowsRuntime]
} catch {
  Emit @{ type = 'error'; message = "Controles multimedia no disponibles: $($_.Exception.Message)" }
  exit 1
}

$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() |
  Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } |
  Select-Object -First 1

function Await($operation, [Type]$resultType) {
  $task = $asTask.MakeGenericMethod($resultType).Invoke($null, @($operation))
  $null = $task.Wait(5000)
  if (-not $task.IsCompleted) { throw 'Tiempo de espera agotado' }
  $task.Result
}

$manager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) `
  ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$propsType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]
$streamType = [Windows.Storage.Streams.IRandomAccessStreamWithContentType]
# El flujo llega como __ComObject y PowerShell no resuelve la sobrecarga de
# AsStreamForRead; invocándolo por reflexión sí se hace la conversión de interfaz.
$asStreamForRead = [System.IO.WindowsRuntimeStreamExtensions].GetMethod('AsStreamForRead', [Type[]]@([Windows.Storage.Streams.IInputStream]))

$sentThumbs = @{}

function Send-Thumbnail($key, $reference) {
  if (-not $reference -or $sentThumbs.ContainsKey($key)) { return }
  $sentThumbs[$key] = $true
  try {
    $stream = Await ($reference.OpenReadAsync()) $streamType
    $netStream = $asStreamForRead.Invoke($null, @($stream))
    $memory = New-Object System.IO.MemoryStream
    $netStream.CopyTo($memory)
    $bytes = $memory.ToArray()
    # ContentType suele venir vacío: se deduce por la firma del archivo.
    $mime = if ($bytes.Length -gt 1 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xD8) { 'image/jpeg' } else { 'image/png' }
    Emit @{ type = 'thumb'; key = $key; data = "data:$mime;base64,$([Convert]::ToBase64String($bytes))" }
    $netStream.Dispose()
    $memory.Dispose()
  } catch {
    # Sin carátula: el widget muestra un marcador.
  }
}

function Find-Session($id) {
  foreach ($s in $manager.GetSessions()) { if ($s.SourceAppUserModelId -eq $id) { return $s } }
  $null
}

function Invoke-Command($line) {
  $order = $line | ConvertFrom-Json
  $session = Find-Session ([string]$order.id)
  if (-not $session) { return }
  $operation = switch ([string]$order.cmd) {
    'toggle' { $session.TryTogglePlayPauseAsync() }
    'next' { $session.TrySkipNextAsync() }
    'prev' { $session.TrySkipPreviousAsync() }
    'seek' {
      # La posición se pide en ticks (100 ns) contando desde StartTime.
      $start = $session.GetTimelineProperties().StartTime.Ticks
      $session.TryChangePlaybackPositionAsync([long]($start + [double]$order.value * 10000000))
    }
    'shuffle' { $session.TryChangeShuffleActiveAsync([bool]$order.value) }
    'repeat' { $session.TryChangeAutoRepeatModeAsync([Windows.Media.MediaPlaybackAutoRepeatMode]([string]$order.value)) }
    default { $null }
  }
  if ($operation) { $null = Await $operation ([bool]) }
}

function Get-Snapshot {
  $current = $manager.GetCurrentSession()
  $currentId = if ($current) { $current.SourceAppUserModelId } else { '' }
  $list = New-Object System.Collections.ArrayList
  foreach ($session in $manager.GetSessions()) {
    try {
      $props = Await ($session.TryGetMediaPropertiesAsync()) $propsType
      $playback = $session.GetPlaybackInfo()
      $timeline = $session.GetTimelineProperties()
      $id = $session.SourceAppUserModelId
      $thumbKey = $null
      if ($props.Thumbnail) {
        $thumbKey = "$id|$($props.Title)|$($props.Artist)|$($props.AlbumTitle)"
        Send-Thumbnail $thumbKey $props.Thumbnail
      }
      $null = $list.Add([ordered]@{
          id        = $id
          title     = [string]$props.Title
          artist    = [string]$props.Artist
          album     = [string]$props.AlbumTitle
          status    = $playback.PlaybackStatus.ToString()
          # Tipo de contenido que declara la app (Music, Video, Image o Unknown).
          kind      = if ($null -eq $playback.PlaybackType) { 'Unknown' } else { $playback.PlaybackType.ToString() }
          canToggle = [bool]($playback.Controls.IsPlayPauseToggleEnabled -or $playback.Controls.IsPlayEnabled -or $playback.Controls.IsPauseEnabled)
          canNext   = [bool]$playback.Controls.IsNextEnabled
          canPrev   = [bool]$playback.Controls.IsPreviousEnabled
          canSeek   = [bool]$playback.Controls.IsPlaybackPositionEnabled
          canShuffle = [bool]$playback.Controls.IsShuffleEnabled
          canRepeat = [bool]$playback.Controls.IsRepeatEnabled
          shuffle   = if ($null -eq $playback.IsShuffleActive) { $null } else { [bool]$playback.IsShuffleActive }
          repeat    = if ($null -eq $playback.AutoRepeatMode) { $null } else { $playback.AutoRepeatMode.ToString() }
          position  = [math]::Round($timeline.Position.TotalSeconds, 2)
          duration  = [math]::Round(($timeline.EndTime - $timeline.StartTime).TotalSeconds, 2)
          updatedAt = $timeline.LastUpdatedTime.ToUnixTimeMilliseconds()
          thumbKey  = $thumbKey
          current   = ($id -eq $currentId)
        })
    } catch {
      # Sesión que desaparece mientras se lee: se ignora en esta vuelta.
    }
  }
  [ordered]@{ type = 'state'; sessions = [object[]]$list.ToArray() }
}

# [Console]::In.ReadLineAsync() bloquea (es un lector sincronizado), así que se
# abre la entrada estándar con un StreamReader propio para leer sin bloquear el bucle.
$stdin = New-Object System.IO.StreamReader([Console]::OpenStandardInput())
$pending = $stdin.ReadLineAsync()
$lastSignature = $null
$lastTimes = @{}

# Hay cambio real si cambia algo distinto del progreso, o si el progreso se aparta
# más de 2 s de lo previsto (salto en la pista). El avance normal lo interpola Nido.
function Test-Changed($snapshot) {
  $signature = ($snapshot.sessions | ForEach-Object {
      "$($_.id)|$($_.title)|$($_.artist)|$($_.album)|$($_.status)|$($_.kind)|$($_.canToggle)$($_.canNext)$($_.canPrev)$($_.canSeek)$($_.canShuffle)$($_.canRepeat)|$($_.shuffle)|$($_.repeat)|$($_.duration)|$($_.thumbKey)|$($_.current)"
    }) -join "`n"
  if ($signature -ne $script:lastSignature) { return $signature }
  foreach ($session in $snapshot.sessions) {
    $previous = $script:lastTimes[$session.id]
    if (-not $previous) { return $signature }
    $predicted = $previous.position
    if ($previous.status -eq 'Playing') { $predicted += ($session.updatedAt - $previous.updatedAt) / 1000 }
    if ([math]::Abs($session.position - $predicted) -gt 2) { return $signature }
  }
  $null
}

while ($true) {
  while ($pending.IsCompleted) {
    $line = $pending.Result
    if ($null -eq $line) { exit 0 }
    try { Invoke-Command $line } catch {}
    $pending = $stdin.ReadLineAsync()
  }

  try {
    $snapshot = Get-Snapshot
    $signature = Test-Changed $snapshot
    if ($null -ne $signature) {
      Emit $snapshot
      $script:lastSignature = $signature
      $script:lastTimes = @{}
      foreach ($session in $snapshot.sessions) {
        $script:lastTimes[$session.id] = @{ position = $session.position; updatedAt = $session.updatedAt; status = $session.status }
      }
    }
  } catch {
    Emit @{ type = 'error'; message = $_.Exception.Message }
  }

  Start-Sleep -Milliseconds 400
}
