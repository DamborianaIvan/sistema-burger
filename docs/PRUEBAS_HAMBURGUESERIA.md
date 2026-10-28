# Etapa 2: pruebas de adaptación

## Actualización local

Conservar `MONGODB_URI` y `JWT_SECRET` propios. El setup no sobrescribe tus `.env`.

Backend: puerto `5001`, `ORDER_TYPES=DELIVERY,TAKEAWAY` y `CORS_ORIGINS=http://localhost:5174,http://127.0.0.1:5174`. Panel: `VITE_API_URL=http://127.0.0.1:5001`.

Reiniciar API y panel, cerrar sesión y volver a entrar. Usar `npm run dev:api` y `npm run dev:panel` desde la raíz. El panel queda en `http://localhost:5174`. El inicio de la API muestra puerto, PID y orígenes; no muestra secretos ni la URI de MongoDB. Si el puerto está ocupado, el inicio falla explícitamente.

## Recorrido manual

Usar datos de prueba identificables y comparar los incrementos respecto del estado anterior: si ya hay ventas o stock, los totales absolutos pueden ser diferentes. No es necesario borrar datos ni volver a crear el administrador inicial.

| Paso | Acción | Resultado esperado |
| --- | --- | --- |
| 1 | Iniciar sesión como ADMIN | Sin enlace a Mesas; Stock y Reportes disponibles. |
| 2 | Revisar Reportes | Solo pestañas Ventas, Caja y Stock. Las ventas corresponden a pedidos del negocio. |
| 3 | Crear o reutilizar un producto de prueba de $8.500 | Categoría Hamburguesas; precio guardado y disponible para venta. |
| 4 | Crear ingredientes Pan y Medallón, cada uno en UNIDAD, y su receta | Una hamburguesa doble usa 1 pan y 2 medallones. Stock y recetas siguen administrados por ADMIN. |
| 5 | Abrir caja o reutilizar la caja abierta | CAJERO puede operar; CHEF/DELIVERY no acceden a caja. |
| 6 | Crear takeaway de una hamburguesa | Nombre/teléfono obligatorios; sin mesa. Pedido por $8.500 enviado a cocina. |
| 7 | Con CHEF, marcar listo; con CAJERO, marcar entregado | CHEF ve preparación sin precios ni datos personales. No puede cobrar ni completar la entrega. |
| 8 | Cobrar takeaway en efectivo y cerrar dos veces | Un solo cobro y un único consumo: 1 pan y 2 medallones. Ticket con identidad Burger. |
| 9 | Crear delivery de dos hamburguesas y completar cocina | Nombre/teléfono/dirección obligatorios. Total $17.000. |
| 10 | Con DELIVERY, marcar entregado; con CAJERO, cobrar por transferencia y cerrar | DELIVERY ve datos de entrega sin precios/cobros; no puede entregar un takeaway. Consumo de 2 panes y 4 medallones. |
| 11 | Revisar resultados y arqueo | Incremento de ventas: $25.500, efectivo $8.500 y transferencia $17.000. Consumo total: 3 panes y 6 medallones. Cierre sin diferencia si el efectivo declarado coincide. |

| 12 | Revisar Auditoría con ADMIN | Cobros y movimientos del negocio trazables, con los permisos conservados. |

No se cambió el criterio de consumo: ocurre al cerrar el pedido y puede dejar stock negativo. Las variantes siguen representándose como productos separados. Extras por unidad, combos configurables y producción de medallones requieren otra etapa de definición.

## Pruebas automáticas

`backend/test.env` conserva salón para la regresión de los módulos disponibles. `perfilBurger.test.js` recorre los dos tipos de pedido, precio en servidor, cocina, roles, cobro, ticket, consumo único y reportes.


`npm test` ejecuta la regresión general y las comprobaciones HTTP sin DB. Las integraciones necesitan `MONGODB_TEST_URI` apuntando a una base **exclusiva de pruebas**, porque limpian sus colecciones. Nunca usar la URI de la base con la que estás probando manualmente ni la de Pepe’s.


El build y el lint se ejecutan mediante `npm run build` y `npm run lint`.

## Verificación de la versión actual

- 193 pruebas del backend aprobadas, sin fallos ni omitidas, con un replica set temporal de MongoDB 7.0.14. Las pruebas exclusivas del circuito comercial retirado se eliminaron junto con ese código; se conservó la regresión de las funcionalidades restantes.
- Contrato del reporte comprobado: solo `periodo`, `ventas`, `caja` y `stock`. Los ingresos se calculan exclusivamente desde los pedidos.
- Revisión de UI en escritorio y móvil con API simulada: navegación, reportes, acceso a Stock/Recetas y destinos exclusivos de CHEF/DELIVERY. La integración con MongoDB se probó por separado.

- Build y lint del panel aprobados. Se mantiene el aviso heredado de tamaño del bundle, sin impedir la compilación.
- Pruebas HTTP de CORS: el preflight permite el origen configurado y no agrega permiso para otro puerto. Prueba de arranque: un puerto ocupado produce `EADDRINUSE`, sin anunciar una API iniciada y cerrando la conexión de DB.
- `git diff --check` aprobado. No se cambiaron dependencias ni credenciales.
