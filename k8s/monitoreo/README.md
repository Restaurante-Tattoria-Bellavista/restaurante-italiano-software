# Monitoreo con Prometheus y Grafana

Prometheus y Grafana corren dentro del mismo clúster que la aplicación, en el namespace `trattoria`. Prometheus lee las métricas de cada réplica del backend cada 15 segundos y Grafana las muestra en un dashboard que se carga solo al arrancar.

```mermaid
flowchart LR
    T(["scripts/generar_trafico.ps1"]) --> F["Frontend<br/>localhost:8081"]
    F --> B1["Pod backend<br/>réplica 1"]
    F --> B2["Pod backend<br/>réplica 2"]
    P[("Prometheus<br/>localhost:9090")] -- "GET /metrics<br/>cada 15 s" --> B1
    P -- "GET /metrics<br/>cada 15 s" --> B2
    G["Grafana<br/>localhost:3000"] -- "consultas PromQL" --> P

    classDef app fill:#fdf3df,stroke:#b8862f,color:#4a3510
    classDef mon fill:#e3f1ec,stroke:#1d6b57,color:#0b3d31
    class F,B1,B2 app
    class P,G mon
```

## Qué mide la API

Las métricas están en `backend/app/core/metricas.py` y se exponen en `GET /metrics`. Ese endpoint no pasa por el Nginx del frontend, así que solo se puede leer desde dentro del clúster.

| Métrica | Tipo | Qué cuenta |
|---|---|---|
| `trattoria_http_requests_total` | Counter | Peticiones atendidas, por método, ruta y código de respuesta |
| `trattoria_http_request_duration_seconds` | Histogram | Tiempo de respuesta por método y ruta |
| `trattoria_http_requests_en_curso` | Gauge | Peticiones que la réplica está atendiendo en ese momento |
| `trattoria_mesas` | Gauge | Mesas activas por estado, leídas de la vista `v_mesas_por_estado` |
| `trattoria_ingreso_facial_total` | Counter | Intentos de ingreso facial: `reconocido` o `no_reconocido` (HU-21) |
| `trattoria_ingreso_facial_comparacion_seconds` | Histogram | Tiempo de comparar el descriptor con los rostros registrados (HU-21) |
| `trattoria_personas_con_rostro` | Gauge | Usuarios con el rostro registrado (HU-21) |

La etiqueta `ruta` guarda la ruta como está declarada (`/api/v1/pedidos/{pedido_id}`) y no la URL real, para que cada pedido no cree una serie nueva en Prometheus. Las rutas que no existen se agrupan como `sin_ruta`.

## Qué hay en la carpeta

| Archivo | Qué crea |
|---|---|
| `01-prometheus.yaml` | Service headless `backend-metricas`, configuración de Prometheus, su Deployment y su Service en el puerto 9090 |
| `02-grafana.yaml` | Fuente de datos y proveedor de dashboards, el Deployment de Grafana y su Service en el puerto 3000 |
| `dashboard-trattoria.json` | El dashboard, guardado en el repositorio para poder cargarlo de nuevo |

## Desplegar

La aplicación ya tiene que estar corriendo en el clúster (ver [`k8s/README.md`](../README.md)). Los comandos se corren desde la raíz del repositorio.

**1. Prometheus**

```powershell
kubectl apply -f k8s/monitoreo/01-prometheus.yaml
```

**2. Contraseña del administrador de Grafana**

Se pide en la terminal y queda guardada solo en un Secret del clúster:

```powershell
$clave = Read-Host "Contraseña para el admin de Grafana"
kubectl create secret generic grafana-admin -n trattoria --from-literal=admin-password=$clave
```

**3. Dashboard**

El dashboard se carga desde el archivo del repositorio, igual que los scripts de la base:

```powershell
kubectl create configmap grafana-dashboard-trattoria -n trattoria --from-file=dashboard-trattoria.json=k8s/monitoreo/dashboard-trattoria.json
```

**4. Grafana**

```powershell
kubectl apply -f k8s/monitoreo/02-grafana.yaml
kubectl get pods,svc -n trattoria
```

**5. Revisar**

- Prometheus: <http://localhost:9090/targets>. En `trattoria-backend` deben aparecer las 2 réplicas en estado **UP**.
- Grafana: <http://localhost:3000>. Abre directo en el dashboard *Trattoria Bellavista - API*. Para verlo no hace falta iniciar sesión; para editarlo se entra con el usuario `admin` y la contraseña del paso 2.

## Generar tráfico

```powershell
powershell -ExecutionPolicy Bypass -File scripts\generar_trafico.ps1
```

El script pide la contraseña del usuario `admin` de la app, recorre varias rutas de la API 200 veces, hace algunas peticiones sin sesión (para que salgan respuestas 401) y 5 intentos de ingreso facial con descriptores al azar. Con `-Rondas 500` genera más tráfico. `-ExecutionPolicy Bypass` solo aplica a esa ejecución; no cambia la configuración de Windows.

## El dashboard

| Panel | Consulta principal |
|---|---|
| Réplicas de la API activas | `count(up{job="trattoria-backend"} == 1)` |
| Peticiones por segundo / Throughput por ruta | `rate(trattoria_http_requests_total[1m])` |
| Latencia p95 / Latencia de la API | `histogram_quantile(0.95, ...duration_seconds_bucket...)` |
| Peticiones en curso | `sum(trattoria_http_requests_en_curso)` |
| Respuestas por código HTTP | `sum by (estado) (rate(trattoria_http_requests_total[1m]))` |
| Mesas por estado | `max by (estado) (trattoria_mesas)` |
| Ingreso con reconocimiento facial (IA) | intentos por resultado, tasa de reconocimiento, tiempo de la comparación y personas con rostro |

Los paneles de tráfico dejan por fuera `/health` y `/health/db`, porque esas rutas las llaman las probes de Kubernetes cada pocos segundos y taparían el tráfico real.

**Cambiar el dashboard.** Lo más cómodo es editarlo en Grafana como admin, exportarlo (*Share* > *Export* > *Save to file*), reemplazar `dashboard-trattoria.json` y recargarlo:

```powershell
kubectl create configmap grafana-dashboard-trattoria -n trattoria --from-file=dashboard-trattoria.json=k8s/monitoreo/dashboard-trattoria.json --dry-run=client -o yaml | kubectl apply -f -
kubectl rollout restart deployment/grafana -n trattoria
```

## Limitaciones

- Prometheus guarda las series en un volumen temporal (`emptyDir`): si su pod se reinicia, las gráficas empiezan de cero. Para la demostración alcanza; en producción iría un volumen persistente.
- Los contadores viven en la memoria de cada réplica, así que se reinician cuando se reinicia el pod. Las consultas con `rate()` y `increase()` ya tienen en cuenta esos reinicios.
- El panel de mesas consulta la base cada vez que Prometheus lee `/metrics` (cada 15 segundos por réplica). Es una consulta pequeña sobre una vista, pero si la base no responde, esa métrica simplemente no aparece en esa lectura.
