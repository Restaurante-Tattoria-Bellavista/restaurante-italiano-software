# Reconciliacion de ramas dev, test y prod

## Objetivo
Conservar las funcionalidades del restaurante y reconciliar
los historiales de desarrollo y produccion.

## Integracion realizada
- Commit de reconciliacion: 4a9e4d4.
- Historial de dev: d417173.
- Historial de prod: 765926e.
- Se resolvieron ocho conflictos.
- Se mantuvo el contenido de dev sin modificaciones.

## Validaciones
- Backend FastAPI: 27 pruebas satisfactorias.
- Frontend React: compilacion exitosa.
- Diferencias de archivos frente a dev: ninguna.
- Scripts PostgreSQL: pendientes de validacion en pruebas.

## Flujo de promocion
feature/fix -> dev -> test -> prod -> main

Las promociones deben realizarse mediante Pull Requests,
con revision de conflictos y verificaciones automatizadas.

## Precauciones
No eliminar ramas permanentes.
No realizar force push.
No ejecutar cambios SQL directamente en produccion
sin pruebas y aprobacion.
