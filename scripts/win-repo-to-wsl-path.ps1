param(
    [Parameter(Mandatory = $true)]
    [string]$WindowsRepo
)
$p = $WindowsRepo.TrimEnd('\')
# Explorer sometimes exposes the repo as C:\wsl$\Distro\... ; wslpath then wrongly yields /mnt/c/wsl$/...
# Drive letter path like C:\wsl$\Ubuntu\home\... (not valid UNC; wslpath maps it to /mnt/c/wsl$/...)
if ($p -match '(?i)^[A-Za-z]:\\wsl\$\\(.+)$') {
    $p = '\\wsl$\' + $Matches[1]
}
if ($p -match '(?i)^\\\\wsl\.localhost\\\$\\([^\\]+)\\(.+)$') {
    Write-Output ('/' + ($Matches[2] -creplace '\\', '/'))
    exit 0
}
if ($p -match '(?i)^\\\\wsl\\\$\\([^\\]+)\\(.+)$') {
    Write-Output ('/' + ($Matches[2] -creplace '\\', '/'))
    exit 0
}
Write-Error "Cannot map Windows repo path to WSL: $WindowsRepo"
exit 2
