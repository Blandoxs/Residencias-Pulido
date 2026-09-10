param(
  # -quitar deshace el arranque automatico
  [switch]$quitar
)

# ====================================================================
#  Deja SIGEV encendido solo, cada vez que alguien inicia sesion en
#  este equipo. No necesita permisos de administrador: coloca un acceso
#  directo en la carpeta de Inicio del usuario actual.
#
#    powershell -File scripts\arranque-automatico.ps1           instalar
#    powershell -File scripts\arranque-automatico.ps1 -quitar   quitar
# ====================================================================

$proyecto = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$lanzador = Join-Path $proyecto "INICIAR-SIGEV.bat"
$inicio   = [Environment]::GetFolderPath("Startup")
$acceso   = Join-Path $inicio "SIGEV.lnk"

if ($quitar) {
  if (Test-Path $acceso) {
    Remove-Item $acceso -Force
    Write-Output ""
    Write-Output "  Arranque automatico desactivado."
    Write-Output "  SIGEV ya no se encendera solo al iniciar sesion."
  } else {
    Write-Output ""
    Write-Output "  El arranque automatico no estaba activado."
  }
  Write-Output ""
  exit 0
}

if (-not (Test-Path $lanzador)) {
  Write-Output ""
  Write-Output "  No se encontro INICIAR-SIGEV.bat en $proyecto"
  Write-Output "  Ejecute este script desde la carpeta del proyecto."
  Write-Output ""
  exit 1
}

$shell = New-Object -ComObject WScript.Shell
$enlace = $shell.CreateShortcut($acceso)
$enlace.TargetPath       = $lanzador
$enlace.WorkingDirectory = $proyecto
$enlace.Description      = "SIGEV - Sistema de Gestion de Equipo y Vigencias"
$enlace.WindowStyle      = 7          # minimizado
$enlace.Save()

Write-Output ""
Write-Output "  Arranque automatico activado."
Write-Output "  SIGEV se encendera solo cada vez que inicie sesion en este equipo,"
Write-Output "  en una ventana minimizada."
Write-Output ""
Write-Output "  Acceso directo: $acceso"
Write-Output "  Apunta a:       $lanzador"
Write-Output ""
Write-Output "  Para quitarlo:  powershell -File scripts\arranque-automatico.ps1 -quitar"
Write-Output ""
