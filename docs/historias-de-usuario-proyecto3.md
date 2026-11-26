# Historias de usuario para el GitHub Project (Proyecto 3)

Borrador para copiar al tablero. El PDF exige al menos una historia por componente (monitoreo, Kubernetes, autenticación, IA). Las historias HU-19, HU-20, HU-21 y HU-23 ya existen en el tablero (Kubernetes, monitoreo, métrica de la IA, ingreso facial); aquí van las que **falta registrar**.

> **Antes de pegar:** los números `HU-XX` son provisionales. Usa los siguientes libres del tablero y ajusta el formato al del Proyecto 2 si difiere (título, descripción, criterios de aceptación, sprint, etiquetas).

---

## HU-XX · Autenticación con JWT en toda la API
**Componente:** Autenticación · **Sprint:** Proyecto 3

**Como** administrador del restaurante, **quiero** que solo las personas con sesión puedan usar la API, **para** que nadie modifique el menú, las mesas o los pedidos sin autorización.

**Criterios de aceptación**
- [ ] `POST /api/auth/login` devuelve un JWT firmado (HS256) con `sub`, `rol`, `iss`, `iat`, `exp` y `jti`.
- [ ] Toda ruta de `/api/v1/*` responde 401 sin token o con un token alterado, vencido o de otro algoritmo (incluido `alg: none`).
- [ ] La llave de firma (`AUTH_SECRET`) viene de un Secret de Kubernetes; con `ENVIRONMENT=production` el backend no arranca si falta o es débil.
- [ ] Una prueba automática falla si alguien agrega una ruta sin protección que no esté en la lista de públicas.

**Evidencia:** `docs/autenticacion.md`, `backend/tests/test_autenticacion.py`.

---

## HU-XX · Roles ADMIN y PERSONAL
**Componente:** Autenticación · **Sprint:** Proyecto 3

**Como** administrador, **quiero** que crear o editar productos, crear mesas, mover el plano y cambiar la configuración sean acciones solo mías, **para** que el personal opere sin poder alterar el negocio.

**Criterios de aceptación**
- [ ] Un usuario `PERSONAL` recibe 403 en `POST/PATCH /productos`, `POST /mesas`, `PUT /mesas/{id}/layout`, `PATCH /configuracion` y en `/api/usuarios`.
- [ ] El rol se consulta en la base en cada petición: un usuario desactivado pierde el acceso al instante aunque su token siga vigente.
- [ ] La interfaz oculta los botones de administración al personal.

**Evidencia:** `backend/tests/test_autenticacion.py` (casos por rol).

---

## HU-XX · Registro y solicitud de acceso con aprobación del administrador
**Componente:** Autenticación · **Sprint:** Proyecto 3

**Como** nuevo empleado, **quiero** pedir una cuenta desde la pantalla de ingreso, **para** no depender de que el administrador me cree el usuario a mano; y **como** administrador, **quiero** aprobar o rechazar cada solicitud, **para** controlar quién entra.

**Criterios de aceptación**
- [ ] La pantalla de ingreso tiene la opción "Solicitar acceso" con nombre, usuario y contraseña.
- [ ] La solicitud queda PENDIENTE y no permite ingresar hasta que un administrador la apruebe.
- [ ] El administrador ve las solicitudes, las aprueba (se crea el usuario con rol PERSONAL) o las rechaza con motivo.
- [ ] Máximo 5 solicitudes por hora por IP; la contraseña se guarda hasheada y se borra al resolver.

**Evidencia:** `backend/tests/test_solicitudes.py`, `docs/autenticacion.md`.

---

## HU-XX · Pedido por voz con Gemini
**Componente:** Inteligencia artificial · **Sprint:** Proyecto 3

**Como** mesero, **quiero** dictar el pedido de una mesa con la voz, **para** que llegue a la cocina sin teclear ni caminar hasta una pantalla.

**Criterios de aceptación**
- [ ] El mesero dicta (navegador o terminal) y el sistema entiende mesa, productos, cantidades y observaciones usando el menú real.
- [ ] Si falta algo (mesa o producto ambiguo), pregunta; no inventa productos ni mesas.
- [ ] Al confirmar, el pedido aparece en Cocina; un pedido ya en cocina no se modifica.
- [ ] Sin clave de Gemini, el texto escrito sigue funcionando con el intérprete local de respaldo.
- [ ] La clave de Gemini es un Secret de Kubernetes y no está en el repositorio.

**Evidencia:** `docs/ia.md`, `backend/tests/test_voz.py`.

---

## HU-XX · Métricas y panel de Grafana de la IA de voz
**Componente:** Monitoreo + IA · **Sprint:** Proyecto 3

**Como** equipo de desarrollo, **quiero** ver cuántos dictados se entienden, cuánto tarda Gemini y cuántas veces se usa el respaldo, **para** detectar fallos de la IA antes de que los note el mesero.

**Criterios de aceptación**
- [ ] `/metrics` expone `trattoria_voz_interpretaciones_total`, `trattoria_voz_interpretacion_seconds`, `trattoria_voz_errores_total` y `trattoria_voz_pedidos_total`.
- [ ] El dashboard tiene la fila "Pedidos por voz con Gemini (IA)" con al menos 4 paneles.
- [ ] `scripts/generar_trafico.ps1` mueve las gráficas sin necesitar micrófono.

**Evidencia:** `k8s/monitoreo/dashboard-trattoria.json`, `backend/tests/test_voz.py`.

---

## HU-XX · Terminal ESP32 con micrófono para tomar pedidos
**Componente:** IoT + IA · **Sprint:** Proyecto 3

**Como** mesero, **quiero** una terminal de mano con botón y micrófono, **para** dictar pedidos en la mesa y ver en una pantalla pequeña lo que entendió el sistema.

**Criterios de aceptación**
- [ ] Al mantener el botón y hablar, el audio llega al servidor y la OLED muestra la respuesta, con pitidos de éxito, pregunta o error.
- [ ] La terminal se autentica con una clave de dispositivo (`X-Device-Key`); sin ella el servidor responde 401.
- [ ] La página Voz muestra la terminal "En línea", su señal WiFi y cuántos pedidos ha dictado.
- [ ] El borrador del pedido se conserva entre audios aunque la API tenga varias réplicas.

**Evidencia:** `firmware/voice-terminal/`, `docs/HANDOFF_IOT.md`, `docs/conexiones.html`.

---

## HU-XX · Localizador BLE del personal
**Componente:** IoT · **Sprint:** Proyecto 3

**Como** administrador, **quiero** saber en qué zona está cada mesero y a qué distancia aproximada, **para** asignar mesas al más cercano.

**Criterios de aceptación**
- [ ] La misma placa ESP32 anuncia su etiqueta por Bluetooth; un gateway lee la señal y la envía con `X-Gateway-Token`.
- [ ] La página "Personal en tiempo real" muestra zona, distancia aproximada y hace cuánto se vio.
- [ ] La distancia se calibra midiendo a 1 m en el local (procedimiento en `docs/HANDOFF_IOT.md`).

**Evidencia:** `hardware/gateway/gateway.py`, `backend/app/routers/ubicaciones.py`.

---

## HU-XX · Autoescalado de la API (HPA) e Ingress
**Componente:** Kubernetes (opcional) · **Sprint:** Proyecto 3

**Como** equipo de operación, **quiero** que la API aumente sus réplicas bajo carga y que haya una única entrada HTTP, **para** soportar picos de pedidos y publicar la app con un solo punto de acceso.

**Criterios de aceptación**
- [ ] `k8s/05-hpa.yaml` escala de 2 a 6 réplicas con el 60 % de CPU.
- [ ] Con `scripts/generar_trafico.ps1` en varias terminales se ven subir las réplicas (`kubectl get hpa -w`) y bajar al terminar.
- [ ] `k8s/06-ingress.yaml` enruta `/` al frontend y `/api` al backend sin exponer `/metrics`.

**Evidencia:** `k8s/README.md` (sección "Opcionales: autoescalado e Ingress").

---

## HU-XX · Mejora del ingreso facial y registro en ventana emergente
**Componente:** Inteligencia artificial · **Sprint:** Proyecto 3

**Como** empleado, **quiero** registrar mi rostro en una ventana con instrucciones y que el ingreso funcione a distintas distancias, **para** entrar mirando a la cámara sin repetir intentos.

**Criterios de aceptación**
- [ ] El registro abre una ventana emergente con instrucciones, caja de detección y poses guiadas.
- [ ] El ingreso usa un reto de un solo uso emitido por el servidor y compara varias capturas con la mediana de distancias.
- [ ] Se rechazan rostros demasiado lejos, cerca, ladeados o duplicados con otra cuenta.

**Evidencia:** `docs/ia.md` (Parte 2), `backend/tests/test_ingreso_facial.py`.
