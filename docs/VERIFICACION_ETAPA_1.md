# Verificación de la primera etapa

Fecha: 28 de octubre de 2026.

Base: `pepes-napoli` en `b277de75632006d15fb8758c3d5ab35231748188`.

## Resultados

- Instalación de ambas aplicaciones con `npm ci` usando sus lockfiles.
- Backend: **202 pruebas aprobadas**, cero fallos y cero omitidas, con MongoDB 7.0.14 en un replica set temporal exclusivo. Incluye las integraciones heredadas de salón, delivery, takeaway, caja, stock, prepizzas, permisos, sesiones, privacidad y auditoría.
- Prueba HTTP adicional: ADMIN/CAJERO no pueden crear un pedido de salón en el perfil delivery/takeaway. Una solicitud anónima recibe 401; CHEF/DELIVERY reciben 403 al intentar crear pedidos.
- Panel: `npm run build` y `npm run lint` aprobados. Build conserva un aviso por tamaño del bundle, que no impide compilar.
- `npm audit --omit=dev --audit-level=high` en backend y `npm audit --audit-level=high` en panel: cero vulnerabilidades informadas en esta ejecución.
- Revisión del panel con navegador automatizado a 1366 y 390 píxeles: login, modalidades recibidas de API, navegación sin Mesas, redirección del acceso directo a Mesas, opciones delivery/takeaway sin salón, alta takeaway y reinicio del formulario en una modalidad válida. Sin errores JavaScript ni desborde horizontal. Esta revisión de UI usó respuestas API simuladas; la integración del backend se verificó por separado con MongoDB.
- Logo provisorio revisado en escritorio y móvil.
- Setup local comprobado: crea configuración propia y conserva los archivos existentes en ejecuciones posteriores.
- `git diff --check` aprobado; archivos `.env` excluidos de Git.

## Límites de esta evidencia

No se verificó Docker Compose en este entorno: la suite se ejecutó con un replica set temporal. La configuración de Compose se entrega para facilitar las pruebas locales del usuario. No se configuró ni probó un despliegue en Render/Vercel, una base de producción ni backups del negocio.

Prepizzas sigue como circuito heredado pendiente de decisión. No se implementaron menú definitivo, producción de medallones, modificadores por unidad ni combos configurables.
