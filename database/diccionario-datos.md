# Modelo entidad-relación y diccionario de datos

**Proyecto:** Trattoria Bellavista — Sistema de gestión de restaurante
**Motor:** PostgreSQL 16
**Historia de usuario:** HU-07 — Diseño del modelo entidad-relación (issue #3)
**Responsable:** Fernando
**Fuente:** modelos SQLAlchemy en `backend/app/models/`

---

## 1. Resumen del modelo

La base de datos tiene **8 tablas**:

| Tabla | Entidad del negocio | Descripción |
|---|---|---|
| `restaurante_config` | Restaurante | Datos generales del restaurante (nombre, moneda, horario…). |
| `mesas` | Mesas | Mesas físicas del restaurante, con su capacidad y estado. |
| `mesa_layout` | Layout | Posición, zona y forma de cada mesa en el plano interactivo. |
| `clientes` | Clientes | Personas que hacen reservas. |
| `reservas` | Reservas | Reserva de una mesa por un cliente en una fecha y hora. |
| `productos` | Productos | Platos y bebidas del menú. |
| `pedidos` | Pedidos | Pedido abierto en una mesa. |
| `detalle_pedido` | Detalles de pedido | Cada producto incluido en un pedido, con su cantidad y precio. |

**Convenciones:**

- **PK** = clave primaria (identificador único de cada fila).
- **FK** = clave foránea (columna que apunta a la clave primaria de otra tabla).
- **UQ** = valor único (no se puede repetir en la tabla).
- **NN** = obligatorio (no admite valores vacíos, `NOT NULL`).
- Todas las fechas usan `TIMESTAMPTZ` (fecha y hora con zona horaria).
- `created_at` se llena automáticamente al crear la fila. `updated_at` se actualiza al modificarla.

---

## 2. Diagrama entidad-relación

La imagen del diagrama está en `database/modelo-er.jpeg`.

El siguiente diagrama se genera a partir de este mismo texto y GitHub lo muestra como imagen:

```mermaid
erDiagram
    mesas ||--o| mesa_layout : "tiene posición"
    mesas ||--o{ pedidos : "tiene"
    mesas ||--o{ reservas : "es reservada en"
    clientes ||--o{ reservas : "realiza"
    pedidos ||--o{ detalle_pedido : "contiene"
    productos ||--o{ detalle_pedido : "aparece en"

    restaurante_config {
        int id PK
        varchar nombre
        varchar especialidad
        varchar moneda
        varchar ciudad
        varchar telefono
        varchar direccion
        varchar horario
        timestamptz updated_at
    }
    mesas {
        int id PK
        int numero UK
        int capacidad
        varchar ubicacion
        varchar estado
        boolean activo
        timestamptz created_at
        timestamptz updated_at
    }
    mesa_layout {
        int mesa_id PK, FK
        varchar zona
        numeric pos_x
        numeric pos_y
        varchar forma
        timestamptz updated_at
    }
    clientes {
        int id PK
        varchar nombre
        varchar telefono
        varchar email UK
        text observaciones
        boolean activo
        timestamptz created_at
        timestamptz updated_at
    }
    reservas {
        int id PK
        int mesa_id FK
        int cliente_id FK
        timestamptz fecha_hora
        int personas
        varchar estado
        text observaciones
        timestamptz created_at
        timestamptz updated_at
    }
    productos {
        int id PK
        varchar nombre UK
        text descripcion
        numeric precio
        varchar categoria
        boolean disponible
        timestamptz created_at
        timestamptz updated_at
    }
    pedidos {
        int id PK
        int mesa_id FK
        varchar estado
        numeric total
        timestamptz created_at
        timestamptz updated_at
        timestamptz closed_at
    }
    detalle_pedido {
        int id PK
        int pedido_id FK
        int producto_id FK
        int cantidad
        numeric precio_unitario
        numeric subtotal
        varchar observacion
        timestamptz created_at
        timestamptz updated_at
    }
```

`restaurante_config` no tiene relaciones con otras tablas.

---

## 3. Relaciones y cardinalidades

| Relación | Cardinalidad | Clave foránea | Al eliminar el registro padre | Regla del negocio |
|---|---|---|---|---|
| `mesas` → `mesa_layout` | 1 : 0..1 | `mesa_layout.mesa_id` | **CASCADE**: se borra también su posición | Cada mesa tiene como máximo una posición en el plano. |
| `mesas` → `pedidos` | 1 : N | `pedidos.mesa_id` | **RESTRICT**: no se puede borrar una mesa con pedidos | Una mesa acumula muchos pedidos a lo largo del tiempo. |
| `mesas` → `reservas` | 1 : N | `reservas.mesa_id` | **RESTRICT** | Una mesa puede reservarse muchas veces. |
| `clientes` → `reservas` | 1 : N | `reservas.cliente_id` | **RESTRICT**: no se puede borrar un cliente con reservas | Un cliente puede hacer muchas reservas. |
| `pedidos` → `detalle_pedido` | 1 : N | `detalle_pedido.pedido_id` | **CASCADE**: se borran también sus líneas | Un pedido contiene varias líneas. Puede estar vacío mientras está `ABIERTO`. |
| `productos` → `detalle_pedido` | 1 : N | `detalle_pedido.producto_id` | **RESTRICT**: no se puede borrar un producto ya vendido | Un producto puede aparecer en muchos pedidos. |

**Significado de las reglas de eliminación:**

- **CASCADE**: si se borra el registro principal, se borran automáticamente los registros que dependen de él.
- **RESTRICT**: PostgreSQL **impide** borrar el registro principal mientras existan registros que dependan de él. Así se protege el historial.

---

## 4. Diccionario de datos por tabla

### 4.1. `restaurante_config`

Configuración general del restaurante. Se espera **una sola fila**.

| Columna | Tipo | Restricciones | Valor por defecto | Descripción |
|---|---|---|---|---|
| `id` | INTEGER | PK | — | Identificador. |
| `nombre` | VARCHAR(150) | NN | `Trattoria Bellavista` | Nombre comercial. |
| `especialidad` | VARCHAR(120) | NN | `Cucina Italiana` | Tipo de cocina. |
| `moneda` | VARCHAR(10) | NN | `COP` | Moneda de los precios. |
| `ciudad` | VARCHAR(120) | — | — | Ciudad. |
| `telefono` | VARCHAR(40) | — | — | Teléfono de contacto. |
| `direccion` | VARCHAR(200) | — | — | Dirección física. |
| `horario` | VARCHAR(160) | — | — | Horario de atención en texto libre. |
| `updated_at` | TIMESTAMPTZ | NN | `now()` | Última modificación. |

### 4.2. `mesas`

| Columna | Tipo | Restricciones | Valor por defecto | Descripción |
|---|---|---|---|---|
| `id` | INTEGER | PK | — | Identificador interno. |
| `numero` | INTEGER | NN, UQ | — | Número visible de la mesa. No se repite. |
| `capacidad` | INTEGER | NN, `capacidad > 0` | — | Número máximo de personas. |
| `ubicacion` | VARCHAR(100) | — | — | Descripción libre de la ubicación. |
| `estado` | VARCHAR(30) | NN, valores permitidos (ver sección 5) | `LIBRE` | Estado operativo actual. |
| `activo` | BOOLEAN | NN | `true` | `false` = mesa desactivada (no se usa, pero se conserva su historial). |
| `created_at` | TIMESTAMPTZ | NN | `now()` | Fecha de creación. |
| `updated_at` | TIMESTAMPTZ | NN | `now()` | Última modificación. |

Restricciones con nombre: `ck_mesas_capacidad_positiva`, `ck_mesas_estado_valido`.

### 4.3. `mesa_layout`

Posición de cada mesa en el plano interactivo. Su clave primaria es también la clave foránea hacia `mesas`, lo que garantiza la relación 1 a 1.

| Columna | Tipo | Restricciones | Valor por defecto | Descripción |
|---|---|---|---|---|
| `mesa_id` | INTEGER | PK, FK → `mesas.id` (CASCADE) | — | Mesa a la que pertenece la posición. |
| `zona` | VARCHAR(30) | NN, `SALON`, `TERRAZA`, `VIP`, `BAR` u `OTRA` | `SALON` | Zona del plano. |
| `pos_x` | NUMERIC(5,2) | NN, entre 0 y 100 | — | Posición horizontal en porcentaje. |
| `pos_y` | NUMERIC(5,2) | NN, entre 0 y 100 | — | Posición vertical en porcentaje. |
| `forma` | VARCHAR(20) | NN, `ROUND`, `RECT` o `SMALL` | `ROUND` | Forma con la que se dibuja la mesa. |
| `updated_at` | TIMESTAMPTZ | NN | `now()` | Última modificación. |

Restricciones con nombre: `ck_mesa_layout_pos_x`, `ck_mesa_layout_pos_y`, `ck_mesa_layout_zona`, `ck_mesa_layout_forma`.

### 4.4. `clientes`

| Columna | Tipo | Restricciones | Valor por defecto | Descripción |
|---|---|---|---|---|
| `id` | INTEGER | PK | — | Identificador. |
| `nombre` | VARCHAR(150) | NN | — | Nombre completo. |
| `telefono` | VARCHAR(30) | — | — | Teléfono. |
| `email` | VARCHAR(150) | UQ | — | Correo. Opcional, pero si se registra no puede repetirse. |
| `observaciones` | TEXT | — | — | Notas (alergias, preferencias…). |
| `activo` | BOOLEAN | NN | `true` | `false` = cliente desactivado. Se puede reactivar. |
| `created_at` | TIMESTAMPTZ | NN | `now()` | Fecha de creación. |
| `updated_at` | TIMESTAMPTZ | NN | `now()` | Última modificación. |

### 4.5. `reservas`

| Columna | Tipo | Restricciones | Valor por defecto | Descripción |
|---|---|---|---|---|
| `id` | INTEGER | PK | — | Identificador. |
| `mesa_id` | INTEGER | NN, FK → `mesas.id` (RESTRICT) | — | Mesa reservada. |
| `cliente_id` | INTEGER | NN, FK → `clientes.id` (RESTRICT) | — | Cliente que reserva. |
| `fecha_hora` | TIMESTAMPTZ | NN | — | Fecha y hora de la reserva. |
| `personas` | INTEGER | NN, `personas > 0` | — | Número de comensales. |
| `estado` | VARCHAR(30) | NN, valores permitidos (ver sección 5) | `PENDIENTE` | Estado de la reserva. |
| `observaciones` | TEXT | — | — | Notas de la reserva. |
| `created_at` | TIMESTAMPTZ | NN | `now()` | Fecha de creación. |
| `updated_at` | TIMESTAMPTZ | NN | `now()` | Última modificación. |

Restricciones con nombre: `ck_reservas_personas_positivas`, `ck_reservas_estado_valido`.

### 4.6. `productos`

| Columna | Tipo | Restricciones | Valor por defecto | Descripción |
|---|---|---|---|---|
| `id` | INTEGER | PK | — | Identificador. |
| `nombre` | VARCHAR(150) | NN, UQ | — | Nombre del producto. No se repite. |
| `descripcion` | TEXT | — | — | Descripción para el menú. |
| `precio` | NUMERIC(12,2) | NN, `precio > 0` | — | Precio de venta actual. |
| `categoria` | VARCHAR(30) | NN, `ENTRADA`, `PLATO_FUERTE`, `BEBIDA`, `POSTRE` u `OTRO` | `OTRO` | Categoría del menú. |
| `disponible` | BOOLEAN | NN | `true` | `false` = no se ofrece en nuevos pedidos. |
| `created_at` | TIMESTAMPTZ | NN | `now()` | Fecha de creación. |
| `updated_at` | TIMESTAMPTZ | NN | `now()` | Última modificación. |

Restricciones con nombre: `ck_productos_precio_positivo`, `ck_productos_categoria_valida`.

### 4.7. `pedidos`

| Columna | Tipo | Restricciones | Valor por defecto | Descripción |
|---|---|---|---|---|
| `id` | INTEGER | PK | — | Identificador. |
| `mesa_id` | INTEGER | NN, FK → `mesas.id` (RESTRICT) | — | Mesa donde se abrió el pedido. |
| `estado` | VARCHAR(30) | NN, valores permitidos (ver sección 5) | `ABIERTO` | Estado del pedido. |
| `total` | NUMERIC(12,2) | NN, `total >= 0` | `0.00` | Suma de los subtotales de sus líneas. |
| `created_at` | TIMESTAMPTZ | NN | `now()` | Apertura del pedido. |
| `updated_at` | TIMESTAMPTZ | NN | `now()` | Última modificación. |
| `closed_at` | TIMESTAMPTZ | — | — | Fecha de cierre. Vacío mientras el pedido sigue activo. |

Restricciones con nombre: `ck_pedidos_estado_valido`, `ck_pedidos_total_no_negativo`.

### 4.8. `detalle_pedido`

| Columna | Tipo | Restricciones | Valor por defecto | Descripción |
|---|---|---|---|---|
| `id` | INTEGER | PK | — | Identificador. |
| `pedido_id` | INTEGER | NN, FK → `pedidos.id` (CASCADE) | — | Pedido al que pertenece la línea. |
| `producto_id` | INTEGER | NN, FK → `productos.id` (RESTRICT) | — | Producto pedido. |
| `cantidad` | INTEGER | NN, `cantidad > 0` | — | Unidades pedidas. |
| `precio_unitario` | NUMERIC(12,2) | NN, `precio_unitario > 0` | — | Precio **en el momento del pedido**. Se guarda aparte para que un cambio de precio posterior no altere pedidos antiguos. |
| `subtotal` | NUMERIC(12,2) | NN, `subtotal > 0` | — | `cantidad × precio_unitario`. |
| `observacion` | VARCHAR(250) | — | — | Indicación especial (por ejemplo, «sin cebolla»). |
| `created_at` | TIMESTAMPTZ | NN | `now()` | Fecha de creación. |
| `updated_at` | TIMESTAMPTZ | NN | `now()` | Última modificación. |

Restricción única `uq_detalle_pedido_producto` sobre (`pedido_id`, `producto_id`): un producto aparece **una sola vez** por pedido. Para pedir más unidades se aumenta la `cantidad`.

Otras restricciones con nombre: `ck_detalle_pedido_cantidad_positiva`, `ck_detalle_pedido_precio_positivo`, `ck_detalle_pedido_subtotal_positivo`.

---

## 5. Estados controlados

PostgreSQL solo acepta los valores listados (restricciones `CHECK`). El **orden de las transiciones** lo controla el backend, no la base de datos.

### 5.1. Estado de `mesas`

| Estado | Significado |
|---|---|
| `LIBRE` | Disponible. Es el estado inicial. |
| `RESERVADA` | Tiene una reserva confirmada. |
| `OCUPADA` | Hay clientes sentados y un pedido activo. |
| `FUERA_DE_SERVICIO` | No disponible para atención. |

### 5.2. Estado de `reservas`

```
PENDIENTE → CONFIRMADA → EN_MESA → COMPLETADA
     ↘           ↘
   CANCELADA   CANCELADA / NO_ASISTIO
```

| Estado | Significado |
|---|---|
| `PENDIENTE` | Recién creada. Estado inicial. |
| `CONFIRMADA` | Aceptada. La mesa pasa a `RESERVADA`. |
| `EN_MESA` | El cliente llegó y se sentó. Se abre un pedido y la mesa pasa a `OCUPADA`. |
| `COMPLETADA` | Atención terminada. |
| `CANCELADA` | Anulada antes de la atención. |
| `NO_ASISTIO` | El cliente no se presentó. |

### 5.3. Estado de `pedidos`

```
ABIERTO → EN_PREPARACION → LISTO → ENTREGADO → PAGADO
(CANCELADO cuando corresponde)
```

| Estado | Significado |
|---|---|
| `ABIERTO` | Se están agregando productos. Estado inicial. |
| `EN_PREPARACION` | Enviado a cocina. No se permite enviar un pedido sin productos. |
| `LISTO` | Cocina terminó la preparación. |
| `ENTREGADO` | Servido en la mesa. |
| `PAGADO` | Cerrado y cobrado. |
| `CANCELADO` | Anulado. |

---

## 6. Decisiones de eliminación y desactivación

Para no perder el historial de ventas y reservas, el modelo combina **desactivación** (la fila se conserva) y **borrado real** protegido por las claves foráneas.

Comportamiento verificado en `backend/app/services/` y `backend/app/repositories/`:

| Tabla | Qué hace `DELETE` en la API | Tipo | Protección de la base de datos |
|---|---|---|---|
| `clientes` | `ClienteService.deactivate` pone `activo = false`. El cliente puede reactivarse. | **Desactivación** | La fila nunca se borra. Se conservan sus reservas. |
| `mesas` | `MesaRepository.delete` ejecuta `db.delete(mesa)`. | **Borrado real** | Si la mesa tiene pedidos o reservas, PostgreSQL **lo impide** (RESTRICT). Si se borra, su `mesa_layout` se borra con ella (CASCADE). |
| `productos` | `ProductoRepository.delete` ejecuta `db.delete(producto)`. | **Borrado real** | Si el producto ya aparece en un pedido, PostgreSQL **lo impide** (RESTRICT). |

Para el resto de tablas no existe un endpoint de borrado y se usan estados:

| Tabla | Cómo se retira un registro | Por qué |
|---|---|---|
| `mesas` (alternativa) | Desactivar (`activo = false`) o marcar `FUERA_DE_SERVICIO`. | Es la forma de retirar una mesa que **ya tiene historial**. |
| `productos` (alternativa) | Marcar `disponible = false`. | Es la forma de retirar un producto que **ya se vendió**. |
| `pedidos` | Se cambia a `CANCELADO`. | Conserva el historial. Si se borrara, se borrarían también sus líneas (CASCADE). |
| `reservas` | Se cambia a `CANCELADA` o `NO_ASISTIO`. | La API no tiene un endpoint para borrar reservas. |
| `detalle_pedido` | Se puede borrar una línea mientras el pedido está abierto. | Es parte de la edición normal del pedido. |
| `mesa_layout` | Se borra automáticamente con su mesa (CASCADE). | No tiene sentido sin la mesa. |

> **Decisión de diseño:** los registros sin historial (una mesa o un producto recién creados por error) pueden borrarse. Los registros con historial se retiran por desactivación. Las reglas RESTRICT garantizan que el historial de pedidos y reservas nunca quede apuntando a una fila inexistente.

---

## 7. Observaciones para las siguientes historias

Estas son reglas que el modelo actual **no** obliga desde la base de datos. Hoy dependen del backend. Se anotan para evaluarlas en HU-08 y HU-12:

1. **Doble reserva:** nada impide crear dos reservas para la misma mesa a la misma hora.
2. **Capacidad:** que `reservas.personas` no supere `mesas.capacidad` lo valida el backend, no la base de datos.
3. **Totales:** que `subtotal = cantidad × precio_unitario` y que `pedidos.total` sea la suma de los subtotales lo calcula el backend.
4. **Configuración única:** nada impide insertar más de una fila en `restaurante_config`.
5. **`updated_at`:** se actualiza desde SQLAlchemy. Un `UPDATE` hecho directamente en SQL no lo cambia, porque no hay un trigger en la base de datos.
6. **Reserva y pedido:** no hay una clave foránea que relacione la reserva con el pedido que se abre al sentar al cliente.
7. **Error al borrar con historial (para backend):** ni `MesaService.delete` ni `ProductoService.delete` comprueban antes si existen pedidos o reservas relacionados. PostgreSQL rechaza el borrado con un `IntegrityError`. Hay que verificar que la API responda con un mensaje claro (por ejemplo, `409 Conflict`: «La mesa tiene pedidos registrados; desactívela en lugar de eliminarla») y no con un `500 Internal Server Error`.
