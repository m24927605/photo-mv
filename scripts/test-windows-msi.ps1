$ErrorActionPreference = 'Stop'
$root = (Get-Location).Path
$msi = Get-Item 'dist/照片MV-0.1.0-Windows-x64-Setup.msi'
$destination = Join-Path $env:RUNNER_TEMP 'PhotoMV-installed'
$installer = New-Object -ComObject WindowsInstaller.Installer
$database = $installer.OpenDatabase($msi.FullName, 0)
$view = $database.OpenView("SELECT ``Value`` FROM ``Property`` WHERE ``Property`` = 'ProductName'")
$view.Execute()
if ($view.Fetch().StringData(1) -ne '照片MV') { throw 'MSI product name mismatch' }
$view.Close()
$view = $database.OpenView('SELECT `Name` FROM `Icon`')
$view.Execute()
if (-not $view.Fetch()) { throw 'MSI icon is missing' }
$view.Close()
[void][Runtime.InteropServices.Marshal]::ReleaseComObject($database)
[void][Runtime.InteropServices.Marshal]::ReleaseComObject($installer)
$installed = $false
$launched = $false
try {
    $log = Join-Path $root 'dist/msi-install.log'
    $arguments = "/i `"$($msi.FullName)`" /qn /norestart ALLUSERS=`"`" MSIINSTALLPERUSER=1 APPLICATIONFOLDER=`"$destination`" /l*v `"$log`""
    $process = Start-Process msiexec.exe -ArgumentList $arguments -Wait -PassThru
    if ($process.ExitCode -notin @(0, 3010)) { throw "MSI install failed: $($process.ExitCode)" }
    $installed = $true
    $expected = Get-ChildItem 'dist/win-unpacked' -Recurse -File
    $actual = Get-ChildItem $destination -Recurse -File
    if ($expected.Count -ne $actual.Count) { throw 'Installed file count mismatch' }
    foreach ($file in $expected) {
        $relative = [IO.Path]::GetRelativePath((Join-Path $root 'dist/win-unpacked'), $file.FullName)
        $target = Join-Path $destination $relative
        if (-not (Test-Path $target) -or (Get-FileHash $file.FullName).Hash -ne (Get-FileHash $target).Hash) { throw "Installed payload mismatch: $relative" }
    }
    $app = Start-Process (Join-Path $destination '照片MV.exe') -PassThru
    $deadline = (Get-Date).AddSeconds(30)
    do {
        Start-Sleep -Milliseconds 500
        $app.Refresh()
        if ($app.HasExited) { throw 'Installed app exited before its editor window appeared' }
    } until ($app.MainWindowTitle -like '照片MV*' -or (Get-Date) -gt $deadline)
    if ($app.MainWindowTitle -notlike '照片MV*') { throw 'Editor window did not appear' }
    $launched = $true
} finally {
    if ($app -and -not $app.HasExited) { & taskkill.exe /PID $app.Id /T /F | Out-Null }
    if ($installed) {
        $log = Join-Path $root 'dist/msi-uninstall.log'
        $process = Start-Process msiexec.exe -ArgumentList "/x `"$($msi.FullName)`" /qn /norestart /l*v `"$log`"" -Wait -PassThru
        if ($process.ExitCode -notin @(0, 3010)) { throw "MSI uninstall failed: $($process.ExitCode)" }
        if (Test-Path (Join-Path $destination '照片MV.exe')) { throw 'Uninstall left the application executable' }
    }
}
@{testedAt=(Get-Date).ToUniversalTime().ToString('o');platform='win32';installerFormat='MSI';installed=$installed;installedPayloadHashesMatch=$true;editorWindowOpened=$launched;uninstalled=$true;allEditorFunctionsTested=$false} | ConvertTo-Json | Set-Content 'docs/test-results/windows-msi.json' -Encoding utf8
