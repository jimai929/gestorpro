# Claude Code statusline — proyecto GestorPro.
# Muestra rama | HEAD corto | clean/dirty | ahead/behind | worktree.
# Reemplaza (no combina) al statusline global mientras se trabaja en este
# repo — ver docs/claude-code/STATUSLINE.md para el trade-off.
#
# Recibe el JSON de estado por stdin (mismo contrato que el statusline
# global: workspace.current_dir es la ruta real, campo confirmado contra
# el binario instalado). Debe degradar en silencio ante cualquier fallo:
# nunca debe bloquear ni hacer fallar a Claude Code.

$ErrorActionPreference = 'SilentlyContinue'

[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$raw = [Console]::In.ReadToEnd()
if (-not $raw) { return }

try { $j = $raw | ConvertFrom-Json } catch { return }

$dir = $j.workspace.current_dir
if (-not $dir) { $dir = $j.workspace.project_dir }
if (-not $dir) { $dir = (Get-Location).Path }
if (-not (Test-Path $dir)) { return }

function Git-Try([string[]]$gitArgs) {
    try {
        $out = & git -C $dir @gitArgs 2>$null
        if ($LASTEXITCODE -ne 0) { return $null }
        return $out
    } catch {
        return $null
    }
}

$parts = @()

# Rama
$branch = Git-Try @('rev-parse', '--abbrev-ref', 'HEAD')
if ($branch) { $parts += $branch }

# HEAD corto
$head = Git-Try @('rev-parse', '--short', 'HEAD')
if ($head) { $parts += $head }

# Limpio / sucio
$status = Git-Try @('status', '--porcelain')
if ($null -ne $status) {
    if ($status) { $parts += 'dirty' } else { $parts += 'clean' }
}

# Ahead / behind del upstream (si no hay upstream, se omite sin fallar)
$counts = Git-Try @('rev-list', '--left-right', '--count', '@{u}...HEAD')
if ($counts) {
    $nums = ($counts -split '\s+') | Where-Object { $_ -ne '' }
    if ($nums.Count -eq 2) {
        $behind = $nums[0]
        $ahead = $nums[1]
        $parts += "${ahead}up ${behind}dn"
    }
}

# Worktree: nombre de carpeta raiz del worktree actual
$top = Git-Try @('rev-parse', '--show-toplevel')
if ($top) {
    # git rev-parse --show-toplevel devuelve SIEMPRE rutas con '/' en toda
    # plataforma. Split-Path -Leaf ya trata '/' como separador tanto en Windows
    # como en Unix, asi que se aplica sobre la salida cruda: convertir '/'->'\'
    # rompia en el Mac mini M4 (pwsh Core sobre Unix), donde '\' no es separador
    # y devolvia la ruta entera en vez del nombre del worktree.
    $wtName = Split-Path -Leaf ($top.Trim())
    if ($wtName) { $parts += "wt:$wtName" }
}

if ($parts.Count -eq 0) { return }

$parts -join ' | ' | Write-Output
