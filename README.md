# Trattoria Bellavista â€” Sistema de gestiÃ³n para restaurante italiano

> **Proyecto acadÃ©mico colaborativo** Â· React + Nginx Â· FastAPI Â· PostgreSQL 17 Â· Docker Compose
> **Ãšltima revisiÃ³n documental:** 23 de octubre de 2026. Este README distingue entre capacidades implementadas, comprobaciones realizadas y pendientes de despliegue.

## 1. DescripciÃ³n y alcance

Trattoria Bellavista es una aplicaciÃ³n para apoyar la gestiÃ³n operativa de un restaurante: mesas y distribuciÃ³n fÃ­sica (*layout*), catÃ¡logo de productos, clientes, reservas, pedidos, estados de cocina, reportes y configuraciÃ³n. La soluciÃ³n organiza su backend como un **monolito modular FastAPI**; la separaciÃ³n por routers, esquemas, modelos y acceso a datos facilita su mantenimiento y posible evoluciÃ³n a servicios independientes.

**Equipo acadÃ©mico:** Keiner, Alejandra y Fernando. Las asignaciones de implementaciÃ³n por historia deben consultarse en GitHub Projects y en las issues correspondientes; no debe confundirse el responsable de Docker con la autorÃ­a exclusiva del backend o frontend.

**Repositorio:** [Restaurante-Tattoria-Bellavista/restaurante-italiano-software](https://github.com/Restaurante-Tattoria-Bellavista/restaurante-italiano-software).

## 2. Arquitectura

```mermaid
flowchart TD
    U[Usuario / navegador] -->|HTTP local :8080| N[React servido por Nginx]
    N -->|/api/, /health, /docs, /openapi.json| A[FastAPI - backend]
    A -->|SQLAlchemy + psycopg| D[(PostgreSQL 17)]
    D --- V[(Volumen persistente postgres_data)]
```

| Capa | TecnologÃ­a / funciÃ³n |
|---|---|
| Interfaz | React, Vite; archivos estÃ¡ticos servidos por Nginx |
| API | Python 3.12, FastAPI y Uvicorn; routers de catÃ¡logo, reservas, operaciÃ³n y salud |
| Persistencia | PostgreSQL 17, SQLAlchemy 2, psycopg 3; inicializaciÃ³n SQL en volumen nuevo |
| Empaquetado | Dockerfiles para frontend y backend; `docker-compose.yml` con tres servicios |
| Red local | Servicios `frontend`, `backend` y `db` en red Compose `internal` |
| ExposiciÃ³n local | El frontend publica `FRONTEND_PORT` (predeterminado `8080`); backend y BD **no** publican puertos del host en el Compose revisado |

### Estructura relevante

```text
backend/
  app/
    main.py
    routers/{health,catalogo,reservas,operacion}.py
    models/  schemas/  db/  core/
  tests/
  Dockerfile
  requirements.txt
frontend-react/
  Dockerfile
  nginx.conf
  package.json
docker/postgres/01-schema.sql
docker-compose.yml
.env.docker.example
README.md
docs/images/incidencias/
```

## 3. Funcionalidades y API

Todas las rutas de negocio revisadas usan prefijo `/api/v1`. La referencia de contrato, parÃ¡metros y modelos se puede consultar en **`http://localhost:8080/docs`** cuando Docker estÃ¡ levantado.

| MÃ³dulo | Ejemplos de endpoints / acciones |
|---|---|
| Mesas y distribuciÃ³n | `GET/POST /api/v1/mesas`, `GET/PATCH /api/v1/mesas/{id}`, `GET/PUT /api/v1/mesas/{id}/layout` |
| Productos | `GET/POST /api/v1/productos`, `GET/PATCH /api/v1/productos/{id}` |
| Clientes | `GET/POST /api/v1/clientes`, `GET/PATCH /api/v1/clientes/{id}` |
| Reservas | `GET/POST /api/v1/reservas`, actualizaciÃ³n y transiciÃ³n de estado de reservas |
| Pedidos | `GET/POST /api/v1/pedidos`, detalles de pedido, actualizaciÃ³n, eliminaciÃ³n y transiciÃ³n de estado |
| Cocina | `GET /api/v1/cocina` |
| Reportes | `GET /api/v1/reportes/dashboard`, `GET /api/v1/reportes/productos` |
| ConfiguraciÃ³n | `GET/PATCH /api/v1/configuracion` |
| Salud | `GET /health`, `GET /health/db` |

**Reglas de negocio implementadas en el cÃ³digo revisado:** restricciÃ³n de reservas solapadas por mesa en ventana de dos horas; validaciÃ³n de capacidad y estado de mesa; un pedido activo por mesa; cÃ¡lculo de subtotal y total en servidor; transiciones controladas de estado de pedido; liberaciÃ³n de mesa al pagar o cancelar segÃºn corresponda. Estas reglas deben verificarse con las pruebas actuales y la demostraciÃ³n funcional, no inferirse Ãºnicamente de la respuesta HTTP 200 del frontend.

## 4. InstalaciÃ³n y despliegue local con Docker (Windows / Linux)

### Prerrequisitos

- Git, Docker Engine y Docker Compose; en Windows, Docker Desktop con backend Linux y WSL 2 funcional.
- Puerto configurable del frontend disponible (predeterminado `8080`).
- Permisos para construir imÃ¡genes y disponer de espacio para PostgreSQL.

### 4.1 Obtener cÃ³digo y configurar credenciales

```bash
git clone https://github.com/Restaurante-Tattoria-Bellavista/restaurante-italiano-software.git
cd restaurante-italiano-software
git switch dev
cp .env.docker.example .env  # En PowerShell: Copy-Item .env.docker.example .env
```

**Editar el `.env` local y reemplazar obligatoriamente `CAMBIAR_PASSWORD`** por una contraseÃ±a fuerte alfanumÃ©rica. No publicar `.env`, credenciales ni salidas de `docker compose config` que expongan secretos. El ejemplo actual utiliza contraseÃ±a alfanumÃ©rica porque se inserta directamente en una URI de PostgreSQL; si se permiten sÃ­mbolos, deben escaparse correctamente o modificarse la construcciÃ³n de la URL.

```dotenv
# EJEMPLO DE FORMATO; nunca usar este valor como contraseÃ±a real
POSTGRES_PASSWORD=CAMBIAR_PASSWORD
FRONTEND_PORT=8080
```

### 4.2 Construir y ejecutar

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
```

Compruebe que `db`, `backend` y `frontend` estÃ©n `healthy` antes de la demostraciÃ³n. Si `up` falla, consultar primero los logs; no borrar volÃºmenes por defecto.

### 4.3 Comprobar servicios

```bash
# Frontend: http://localhost:8080
# DocumentaciÃ³n API: http://localhost:8080/docs
# Esquema OpenAPI: http://localhost:8080/openapi.json
# API a travÃ©s de proxy:
curl -i http://localhost:8080/health
curl -i http://localhost:8080/health/db

docker compose ps
docker compose logs --tail=80 backend
docker compose logs --tail=80 frontend
```

En PowerShell puede usarse `Invoke-WebRequest -UseBasicParsing` en lugar de `curl`. `docker compose exec -T db pg_isready -U restaurant -d restaurant` comprueba la disponibilidad de PostgreSQL (no demuestra por sÃ­ solo que FastAPI puede autenticarse).

### 4.4 Ciclo de vida y preservaciÃ³n de datos

```bash
docker compose stop          # Pausa los contenedores sin borrar el volumen
docker compose start         # Vuelve a iniciarlos
docker compose up -d --build # Actualiza servicios segÃºn Compose
```

**No ejecutar `docker compose down -v` durante diagnÃ³stico o actualizaciÃ³n:** elimina los volÃºmenes gestionados y puede destruir los datos. El script `01-schema.sql` se aplica durante la inicializaciÃ³n de un directorio de PostgreSQL nuevo; **no** funciona como mecanismo automÃ¡tico de migraciÃ³n de una base persistente ya existente.

## 5. Despliegue en nube â€” procedimiento propuesto, NO certificado

**Estado:** el equipo certificÃ³ en un equipo Windows el despliegue *local* de Docker; no se dispone en estas evidencias de URL pÃºblica, dominio, proveedor ni infraestructura de producciÃ³n en la nube. Esta secciÃ³n es una **guÃ­a operativa para realizar el despliegue**, no una afirmaciÃ³n de que ya estÃ¡ publicado.

1. Elegir proveedor y entorno (VM Linux compatible con Docker Compose o servicio administrado equivalente). Dimensionar recursos, accesos y copias de seguridad.
2. Aprovisionar host, habilitar Docker y Compose y obtener el cÃ³digo desde una referencia revisada (rama/tag/commit aprobado).
3. Crear `.env` **solo en el servidor**, con secretos robustos y acceso restringido. No copiar contraseÃ±as desde capturas ni del repositorio.
4. Configurar un proxy pÃºblico con HTTPS/TLS, dominio y certificados vÃ¡lidos. Preferir exponer solo `443/80` mediante reverse proxy; **no exponer PostgreSQL ni FastAPI** directamente a Internet. El Compose actual publica `8080` HTTP y **no incluye TLS**, por lo que requiere adecuaciÃ³n previa a uso pÃºblico.
5. Configurar persistencia de PostgreSQL en almacenamiento fiable, respaldo automatizado (por ejemplo `pg_dump` con retenciÃ³n), prueba real de restauraciÃ³n y monitoreo de uso de disco.
6. Definir procedimiento de despliegue: respaldo previo, `docker compose config --quiet`, `docker compose up -d --build`, salud y pruebas E2E; rollback de imÃ¡genes/configuraciÃ³n ante fallos.
7. Probar desde fuera de la red: web, `/docs` si se permite en producciÃ³n, flujo de API, conectividad a BD, encabezados seguros, expiraciÃ³n TLS y persistencia despuÃ©s de reinicio.
8. Registrar URL, fecha, versiÃ³n/commit, responsable, evidencia, plan de recuperaciÃ³n y resultado de las pruebas. **No declarar Â«desplegado en nubeÂ» hasta completarlo.**

> Nota: para producciÃ³n se recomienda gestionar secretos con un gestor seguro, restringir `/docs` si corresponde y usar PostgreSQL administrado o reforzar el respaldo y seguridad del contenedor. Es una recomendaciÃ³n operativa, no una caracterÃ­stica ya implementada.

## 6. ValidaciÃ³n registrada â€” 23/10/2026

| VerificaciÃ³n local | Evidencia / resultado |
|---|---|
| `docker compose config --quiet` | OK tras crear `.env` |
| `docker compose up -d --build` | ImÃ¡genes construidas; inicialmente bloqueado por backend `unhealthy` |
| PostgreSQL `pg_isready` | Acepta conexiones |
| PostgreSQL directo `SELECT 1` | Devuelve `1` |
| SQLAlchemy desde FastAPI `SELECT 1` | Devuelve `1` tras sincronizar contraseÃ±a |
| FastAPI `/health` y `/health/db` | Ambos HTTP 200 tras correcciÃ³n |
| Docker Compose `ps` | Backend y BD `healthy`; frontend confirmado `healthy` en comprobaciÃ³n previa al reinicio de Nginx |
| `GET /` vÃ­a `localhost:8080` | HTTP 200 |
| `GET /openapi.json` vÃ­a `localhost:8080` | HTTP 502 inicialmente; HTTP 200 tras reiniciar Ãºnicamente frontend |
| OpenAPI programÃ¡tico | Se informÃ³ `21` paths en la sesiÃ³n de prueba |
| Pruebas completas de negocio en el despliegue actual | **No hay ejecuciÃ³n integral registrada en esta sesiÃ³n**; pendiente |

Las comprobaciones anteriores corresponden al entorno local probado, no a producciÃ³n en nube. Los *healthchecks* no sustituyen pruebas de flujo real ni pruebas de seguridad.

## 7. GitHub y estrategia de ramas

Flujo de promociÃ³n configurado en `pr-governance.yml`:

```text
feature/*, fix/*, chore/*, docs/* -> dev
                                  dev -> test
                                 test -> prod
                              prod -> main
                             hotfix/* -> prod
```

PR revisados: [HU-13 #33](https://github.com/Restaurante-Tattoria-Bellavista/restaurante-italiano-software/pull/33), [HU-14 #34](https://github.com/Restaurante-Tattoria-Bellavista/restaurante-italiano-software/pull/34), [HU-15 #35](https://github.com/Restaurante-Tattoria-Bellavista/restaurante-italiano-software/pull/35), [HU-16 #36](https://github.com/Restaurante-Tattoria-Bellavista/restaurante-italiano-software/pull/36) y [HU-17 #38](https://github.com/Restaurante-Tattoria-Bellavista/restaurante-italiano-software/pull/38).

**Estado verificado el 23/10/2026:** HU-13, HU-14, HU-15 y HU-16 fusionadas hacia `dev`; HU-17 se fusionÃ³ primero hacia la rama de HU-16 y sus cambios se incorporaron a `dev` al fusionar HU-16. El PR [#26](https://github.com/Restaurante-Tattoria-Bellavista/restaurante-italiano-software/pull/26) quedÃ³ fusionado de `dev` a `main` aunque su descripciÃ³n mencionaba promociÃ³n a `test`; eso debe documentarse como desviaciÃ³n del flujo, no como procedimiento recomendado. Al revisar el PR [#52](https://github.com/Restaurante-Tattoria-Bellavista/restaurante-italiano-software/pull/52) de `dev` a `test`, aparecÃ­a **abierto con conflictos**: estado temporal sujeto a revalidaciÃ³n.

## 8. BitÃ¡cora de incidentes y resoluciÃ³n

Estos incidentes proceden de las evidencias compartidas durante la certificaciÃ³n. Las capturas ilustran los fallos **en el momento en que ocurrieron**; no representan necesariamente el estado actual del repositorio.

| ID | SÃ­ntoma y diagnÃ³stico | AcciÃ³n / resoluciÃ³n | Estado documentado |
|---|---|---|---|
| INC-01 | PR #36 aprobado pero check `Validar Pull Request` fallido y stack divergente | Revisar ramas, `merge-base` y log del workflow; se evitÃ³ rebase masivo | **Resuelto por integraciÃ³n posterior** de #36; check histÃ³rico fallido |
| INC-02 | Workflow evaluaba `feature/HU-16... â†’ main` pese a que el PR visible tenÃ­a base `dev` | Confirmar evento y logs del job; no forzar merge por check invÃ¡lido; PR #36 finalmente fusionado | **HistÃ³rico; comportamiento exacto del evento sin causa raÃ­z confirmada** |
| INC-03 | Stack #39 indicaba conflictos en PR #26 (`dev` â†’ `main`) | Tratar conflicto como independiente de HU-16; no ejecutar `gh stack rebase` ciegamente | PR #26 posteriormente fusionado; resoluciÃ³n detallada no documentada |
| INC-04 | `docker compose` rechazaba configuraciÃ³n por falta de `POSTGRES_PASSWORD` | Crear `.env` local a partir de plantilla, contraseÃ±a robusta; `compose config --quiet` OK | Resuelto |
| INC-05 | Docker Engine no respondÃ­a por `dockerDesktopLinuxEngine`; WSL `docker-desktop` detenida | Iniciar Docker Desktop y verificar `docker version`, WSL 2 y contexto `desktop-linux` | Resuelto |
| INC-06 | Backend iniciaba pero `GET /health/db` devolvÃ­a HTTP 503; `unhealthy` | Verificar red TCP y `SELECT 1`; identificar `password authentication failed` | Causa identificada |
| INC-07 | ContraseÃ±a nueva de `.env` no coincidÃ­a con la credencial del usuario PostgreSQL ya persistido | `ALTER ROLE restaurant WITH PASSWORD ...` sin borrar volumen; SQLAlchemy `SELECT 1` y ambos health HTTP 200 | Resuelto en laboratorio |
| INC-08 | Nginx devolvÃ­a HTTP 502 en `/openapi.json` aunque el backend devolvÃ­a HTTP 200 internamente | `docker compose restart frontend` exclusivamente; proxy respondiÃ³ HTTP 200 | Resuelto en laboratorio; probable resoluciÃ³n DNS/upstream desactualizada, no demostrada en profundidad |
| INC-09 | `git branch` y worktrees: HU-16 local detrÃ¡s del remoto; worktrees `detached HEAD` | InspecciÃ³n no destructiva; no usar `reset --hard` ni `force push` | Evidencia histÃ³rica; revisar entorno local antes de manipularlo |
| INC-10 | Despliegue en nube y pruebas E2E completas | Aplicar secciÃ³n 5, registrar versiÃ³n y pruebas | **Pendiente** |

### INC-01 â€” Check fallido y stack divergente

![HU-16: check fallido y stack](docs/images/incidencias/01-pr36-checks-stack.png)

### INC-02 â€” El workflow recibe una base incorrecta

![GitHub Actions: flujo de HU-16 hacia main](docs/images/incidencias/02-actions-flujo-main.png)

![HU-16 aprobado con check bloqueado](docs/images/incidencias/03-pr36-aprobado-bloqueado.png)

![RevalidaciÃ³n de HU-16 con el mismo error](docs/images/incidencias/05-revalidacion-hu16-main.png)

![Reintento de GitHub Actions sin Ã©xito](docs/images/incidencias/06-reintento-workflow-fallido.png)

### INC-03 â€” Conflicto de promociÃ³n / stack

![Stack de GitHub indicando conflictos en PR #26](docs/images/incidencias/04-conflicto-stack-pr26.png)

### INC-04 a INC-08 â€” Evidencia tÃ©cnica de Docker

Las siguientes salidas proceden de la consola utilizada en la certificaciÃ³n y se resumen sin datos secretos:

```text
# Falta configuraciÃ³n
required variable POSTGRES_PASSWORD is missing a value

# Motor Docker no disponible inicialmente
failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine

# Fallo de autenticaciÃ³n
FATAL: password authentication failed for user "restaurant"
GET /health/db HTTP/1.1 -> 503

# CorrecciÃ³n de credencial (sin borrar datos)
BACKEND_DB_SELECT1= 1
/health HTTP 200
/health/db HTTP 200
backend: healthy
db: healthy

# Proxy Nginx
GET /openapi.json -> HTTP 502
reinicio exclusivo de frontend
GET /openapi.json -> HTTP 200
```

**Lecciones:** una BD `healthy` no garantiza autenticaciÃ³n del backend; `pg_isready` no valida una contraseÃ±a remota; cambiar `.env` **no** cambia la contraseÃ±a de un rol de PostgreSQL ya inicializado; un proxy Nginx persistente puede requerir reinicio al cambiar su upstream; releer el detalle de cada check CI antes de modificar cÃ³digo o rebasar ramas.

## 9. Pruebas recomendadas antes de liberar versiÃ³n

- Ejecutar pruebas del backend desde entorno controlado (por ejemplo `python -m pytest backend/tests -q`, con dependencias y configuraciÃ³n adecuadas).
- Ejecutar `npm ci`, `npm run lint` y `npm run build` desde `frontend-react/`.
- Verificar con datos de prueba altas/ediciones de mesas, productos, clientes, reservas, pedidos y transiciones de cocina, incluidos los cÃ³digos 400/404/409/422 esperados por contrato.
- Probar persistencia de PostgreSQL tras **reinicio no destructivo**; verificar respaldo y restauraciÃ³n antes de nube.
- Registrar evidencia de PR/checks verdes y de promociÃ³n `dev â†’ test â†’ prod â†’ main`.

## 10. Pendientes y criterios de cierre

| Pendiente | Criterio de cierre |
|---|---|
| PromociÃ³n `dev â†’ test` | PR #52 sin conflictos, checks obligatorios correctos y revisiÃ³n aprobada |
| Calidad E2E | Pruebas de operaciones y UI documentadas sobre un commit identificable |
| Seguridad para nube | HTTPS, secretos seguros, exposiciÃ³n de puertos mÃ­nima y respaldo restaurable |
| Despliegue pÃºblico | URL pÃºblica verificada desde otra red, salud, operaciones y versiÃ³n publicada |
| DocumentaciÃ³n visual adicional | Capturas de interfaz, Docker Healthy y flujos funcionales sin datos privados |

## 11. Seguridad de las evidencias

Las imÃ¡genes que acompaÃ±an este README provienen de capturas del historial de incidencias. No agregar capturas de `.env`, tokens, contraseÃ±as, direcciones privadas, datos de clientes ni datos productivos. Las capturas de GitHub muestran referencias pÃºblicas a PR y workflows. Las imÃ¡genes se deben versionar junto con el README en las rutas relativas indicadas.

---

*DocumentaciÃ³n elaborada a partir del cÃ³digo revisado en `dev`, las respuestas observadas durante la certificaciÃ³n local y el historial de PR. Una funcionalidad descrita en cÃ³digo no sustituye su prueba E2E.*
