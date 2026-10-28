# Etapa 2: pruebas de adaptación

## Actualización local

Conservar `MONGODB_URI` y `JWT_SECRET` propios. El setup no sobrescribe tus `.env`.

Backend: puerto `5001`, `ORDER_TYPES=DELIVERY,TAKEAWAY`, `ENABLE_PREPIZZAS=false` y `CORS_ORIGINS=http://localhost:5174,http://127.0.0.1:5174`. Panel: `VITE_API_URL=http://127.0.0.1:5001`.

Reiniciar API y panel, cerrar sesión y volver a entrar. Usar `npm run dev:api` y `npm run dev:panel` desde la raíz. El panel queda en `http://localhost:5174`. El inicio de la API muestra puerto, PID y orígenes; no muestra secretos ni la URI de MongoDB. Si el puerto está ocupado, el inicio falla explícitamente.

## Recorrido manual

Usar datos de prueba identificables y comparar los incrementos respecto del estado anterior: si ya hay ventas o stock, los totales absolutos pueden ser diferentes. No es necesario borrar datos ni volver a crear el administrador inicial.

| Paso | Acción | Resultado esperado |
| --- | --- | --- |
| 1 | Iniciar sesión como ADMIN | Sin enlaces a Prepizzas ni Mesas; Stock y Reportes disponibles. |
| 2 | Abrir `/panel/prepizzas` directamente | Redirección al inicio, sin cargar el módulo. |
| 3 | Revisar Reportes | Pestañas Ventas, Caja y Stock. Sin pestaña ni sumatoria de ventas de Prepizzas. |
| 4 | Crear o reutilizar un producto de prueba de $8.500 | Categoría Hamburguesas; precio guardado y disponible para venta. |
| 5 | Crear ingredientes Pan y Medallón, cada uno en UNIDAD, y su receta | Una hamburguesa doble usa 1 pan y 2 medallones. Stock y recetas siguen administrados por ADMIN. |
| 6 | Abrir caja o reutilizar la caja abierta | CAJERO puede operar; CHEF/DELIVERY no acceden a caja. |
| 7 | Crear takeaway de una hamburguesa | Nombre/teléfono obligatorios; sin mesa. Pedido por $8.500 enviado a cocina. |
| 8 | Con CHEF, marcar listo; con CAJERO, marcar entregado | CHEF ve preparación sin precios ni datos personales. No puede cobrar ni completar la entrega. |
| 9 | Cobrar takeaway en efectivo y cerrar dos veces | Un solo cobro y un único consumo: 1 pan y 2 medallones. Ticket con identidad Burger. |
| 10 | Crear delivery de dos hamburguesas y completar cocina | Nombre/teléfono/dirección obligatorios. Total $17.000. |
| 11 | Con DELIVERY, marcar entregado; con CAJERO, cobrar por transferencia y cerrar | DELIVERY ve datos de entrega sin precios/cobros; no puede entregar un takeaway. Consumo de 2 panes y 4 medallones. |
| 12 | Revisar resultados y arqueo | Incremento de ventas: $25.500, efectivo $8.500 y transferencia $17.000. Consumo total: 3 panes y 6 medallones. Cierre sin diferencia si el efectivo declarado coincide. |
| 13 | Revisar Auditoría con ADMIN | Cobros y movimientos trazables. El filtro de Prepizzas se conserva como histórico; no habilita ventas nuevas. |

No se cambió el criterio de consumo: ocurre al cerrar el pedido y puede dejar stock negativo. Las variantes siguen representándose como productos separados. Extras por unidad, combos configurables y producción de medallones requieren otra etapa de definición.

## Pruebas automáticas

`npm test` ejecuta la regresión general y las comprobaciones HTTP sin DB. Las integraciones necesitan `MONGODB_TEST_URI` apuntando a una base **exclusiva de pruebas**, porque limpian sus colecciones. Nunca usar la URI de la base con la que estás probando manualmente ni la de Pepe’s.

`backend/test.env` habilita el circuito heredado y salón para mantener su regresión. `perfilBurger.test.js` usa el perfil delivery/takeaway con Prepizzas deshabilitado y recorre los dos tipos de pedido, precio en servidor, cocina, roles, cobro, ticket, consumo único y reportes. También comprueba que un pedido mayorista histórico no se borre ni se agregue a las ventas del negocio.

El build y el lint se ejecutan mediante `npm run build` y `npm run lint`.

## Verificación realizada el 28/10/2026

- 208 pruebas de backend aprobadas, sin fallos ni omitidas, con MongoDB 7.0.14 en un replica set temporal exclusivo de pruebas. No se accedió a la base de Atlas del usuario.
- Build y lint del panel aprobados. Se mantiene el aviso heredado de tamaño del bundle, sin impedir la compilación.
- Navegador automatizado: login con perfil del backend, menú sin Prepizzas/Mesas, redirección de la URL heredada, reportes sin sección mayorista y acceso conservado a Stock/Recetas. CHEF y DELIVERY mantienen sus destinos exclusivos. Sin errores JavaScript ni desborde horizontal a 390 píxeles. Esta verificación visual usó respuestas API simuladas; la integración con MongoDB se verificó por separado.
- Pruebas HTTP de CORS: el preflight permite el origen configurado y no agrega permiso para otro puerto. Prueba de arranque: un puerto ocupado produce `EADDRINUSE`, sin anunciar una API iniciada y cerrando la conexión de DB.
- `git diff --check` aprobado. No se cambiaron dependencias ni credenciales.
