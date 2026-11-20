<#
Genera tráfico de prueba contra la API para ver moverse las gráficas de Grafana (HU-20).

Inicia sesión con un usuario de la app, recorre varias rutas de la API muchas veces,
hace algunas peticiones sin sesión (para que aparezcan respuestas 401) y unos pocos
intentos de ingreso facial con descriptores al azar (salen como "no reconocido" en
el panel de la IA). Al final muestra un resumen por código de respuesta.

Uso, desde la raíz del repositorio:
    powershell -ExecutionPolicy Bypass -File scripts\generar_trafico.ps1
    powershell -ExecutionPolicy Bypass -File scripts\generar_trafico.ps1 -Rondas 500

La contraseña se pide al empezar y no queda guardada en ningún lado.
#>
param(
    [string]$Url = "http://localhost:8081",
    [string]$Usuario = "admin",
    [int]$Rondas = 200,
    # La API bloquea una IP por 10 minutos después de 10 intentos faciales fallidos.
    [int]$IntentosFaciales = 5
)

$ErrorActionPreference = "Stop"
# La barra de progreso de Invoke-WebRequest hace muy lento a Windows PowerShell.
$ProgressPreference = "SilentlyContinue"

$segura = Read-Host "Contraseña de $Usuario" -AsSecureString
$puntero = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura)
$clave = [Runtime.InteropServices.Marshal]::PtrToStringAuto($puntero)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($puntero)

try {
    $cuerpo = @{ username = $Usuario; password = $clave } | ConvertTo-Json
    $sesion = Invoke-RestMethod -Method Post -Uri "$Url/api/auth/login" -ContentType "application/json" -Body $cuerpo
} catch {
    Write-Host "No se pudo iniciar sesión. Revisa el usuario, la contraseña y que la app esté abierta en $Url" -ForegroundColor Red
    exit 1
} finally {
    $clave = $null
}
$conSesion = @{ Authorization = "Bearer $($sesion.token)" }

$rutas = @(
    "/api/v1/mesas",
    "/api/v1/productos",
    "/api/v1/clientes",
    "/api/v1/reservas",
    "/api/v1/pedidos",
    "/api/v1/cocina",
    "/api/v1/configuracion",
    "/api/v1/reportes/dashboard"
)
$conteo = @{}

function Pedir([string]$Metodo, [string]$Ruta, $Encabezados = $null, [string]$Cuerpo = $null) {
    $parametros = @{ Method = $Metodo; Uri = "$Url$Ruta"; UseBasicParsing = $true; TimeoutSec = 10 }
    if ($Encabezados) { $parametros.Headers = $Encabezados }
    if ($Cuerpo) { $parametros.Body = $Cuerpo; $parametros.ContentType = "application/json" }
    try {
        $codigo = [int](Invoke-WebRequest @parametros).StatusCode
    } catch {
        $respuesta = $_.Exception.Response
        $codigo = if ($respuesta) { [int]$respuesta.StatusCode } else { 0 }
    }
    $script:conteo[$codigo] = 1 + [int]$script:conteo[$codigo]
}

Write-Host "Enviando tráfico a $Url ($Rondas rondas de $($rutas.Count) peticiones)..." -ForegroundColor Cyan
$reloj = [Diagnostics.Stopwatch]::StartNew()

for ($i = 1; $i -le $Rondas; $i++) {
    foreach ($ruta in $rutas) { Pedir "GET" $ruta $conSesion }
    if ($i % 10 -eq 0) {
        Pedir "GET" "/api/v1/mesas"   # sin sesión: la API responde 401
        Write-Host ("  ronda {0} de {1}" -f $i, $Rondas)
    }
}

for ($j = 1; $j -le $IntentosFaciales; $j++) {
    $descriptor = 1..128 | ForEach-Object { [math]::Round((Get-Random -Minimum -1000 -Maximum 1000) / 10000, 4) }
    Pedir "POST" "/api/auth/face-login" $null (@{ descriptor = $descriptor } | ConvertTo-Json -Compress)
}

$reloj.Stop()
$total = ($conteo.Values | Measure-Object -Sum).Sum
$segundos = [math]::Max($reloj.Elapsed.TotalSeconds, 0.001)

Write-Host ""
Write-Host ("Listo: {0} peticiones en {1:N1} s ({2:N1} por segundo)" -f $total, $segundos, ($total / $segundos)) -ForegroundColor Green
$conteo.GetEnumerator() | Sort-Object Name | ForEach-Object {
    $nombre = if ($_.Name -eq 0) { "sin respuesta" } else { "HTTP $($_.Name)" }
    Write-Host ("  {0,-14} {1}" -f $nombre, $_.Value)
}
