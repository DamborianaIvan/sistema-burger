# Gestión de prepizzas

La sección `/panel/prepizzas` reúne Stock, Comercios y Pedidos y entregas.

## Circuito de uso

1. Un administrador crea variedades con precio sugerido y receta opcional por unidad. Los ingredientes se eligen entre los de Stock y las cantidades usan la unidad configurada allí.
2. Registra producción. Puede descontar ingredientes según receta o ingresar stock ya elaborado sin consumirlos. Las bajas por pérdida o vencimiento exigen un motivo.
3. Crea comercios con dirección, teléfono y plazo de seguimiento (cinco días inicialmente).
4. Registra un pedido con una o más variedades. Puede acordar precios distintos a los sugeridos: quedan guardados en el pedido. Crear un pedido no reserva stock.
5. Confirma la entrega. Descuenta las prepizzas disponibles y guarda fecha, responsable, comercio y cantidades. No vuelve a consumir ingredientes.
6. Cobra el total o cuotas del pedido. Cada cobro registra importe, método, fecha, responsable y caja. Se exige una caja abierta y se incorporan sus importes a los totales del cierre.
7. Al vencer el plazo aparece un aviso en Prepizzas para consultar por reposición. Marcar como contactado guarda la nota y permite definir cuántos días esperar. Una nueva entrega reinicia el plazo. El aviso es interno; no envía mensajes ni estima el stock del comercio.

El comercio conserva sus pedidos y contactos. Las variedades y los comercios se desactivan sin borrar el historial. Solo pueden cancelarse pedidos pendientes de entrega sin cobros; entregas y cobros confirmados no se editan ni se eliminan desde esta primera versión.

## Reportes y caja

- Las ventas de prepizzas se reconocen por fecha de entrega.
- Los cobros se reconocen por fecha de pago: pueden corresponder a pedidos de otro período o ser anticipos.
- El saldo al cierre del período incluye pedidos registrados hasta esa fecha, entregados o por entregar, descontando únicamente pagos realizados hasta entonces.
- El resumen general suma las ventas del restaurante a las prepizzas entregadas. La cantidad de pedidos y el promedio del restaurante permanecen discriminados.
- El reporte Prepizzas incluye producción, bajas, entregas, ventas, cobros por método y detalle por comercio.
- Los ingredientes consumidos al producir también aparecen en Stock y sus reportes.
- Los ingresos de prepizzas se registran en MovimientoCaja con `pedidoPrepizzaId` y no se duplican como pedidos del restaurante.

## Permisos

| Rol | Alcance |
| --- | --- |
| ADMIN | Todo el módulo, variedades, recetas y movimientos de stock |
| CAJERO | Consulta de stock, comercios, pedidos, entregas, cobros y contactos |
| CHEF / DELIVERY | Sin acceso a este módulo |

## Consistencia y despliegue

Las operaciones que afectan stock, pedidos o caja usan transacciones de MongoDB. Se requiere replica set o MongoDB Atlas; un MongoDB standalone local debe configurarse como replica set. No requiere migrar datos existentes. Mongoose crea las colecciones e índices nuevos con el mecanismo habitual del proyecto.

Las solicitudes de producción/baja, creación de pedido y cobro requieren `claveOperacion` (UUID generado por la interfaz). Reintentar con la misma clave conserva el resultado original, sin duplicar movimientos ni pagos. La entrega repetida del mismo pedido tampoco descuenta dos veces. Los conflictos simultáneos se reintentan mediante transacciones, y el servidor rechaza entregas sin stock y cobros superiores al saldo.

## API autenticada

Base `/api/prepizzas`, permiso `prepizzas:operate`.

| Método y ruta | Uso |
| --- | --- |
| GET `/resumen` | Variedades, comercios con saldo y aviso, pedidos paginados e historial de hasta 200 movimientos |
| POST `/variedades` | Alta de variedad, precio y componentes de receta (ADMIN) |
| PATCH `/variedades/:id` | Edición de nombre, precio, receta o estado (ADMIN) |
| POST `/movimientos` | `variedadId`, `tipo` PRODUCCION/BAJA, `cantidad`, `motivo`, `consumirIngredientes`, `claveOperacion` (ADMIN) |
| POST `/comercios` | Nombre, dirección, teléfono y `diasSeguimiento` |
| PATCH `/comercios/:id` | Datos, plazo y estado |
| POST `/comercios/:id/contactos` | `nota` y `diasHastaContacto` |
| POST `/pedidos` | `comercioId`, `items` con variedad/cantidad/precio, observaciones y clave |
| POST `/pedidos/:id/entregar` | Confirma entrega y descuenta stock |
| POST `/pedidos/:id/cobros` | `monto`, `metodo`, `claveOperacion`; requiere permiso de cobro |
| POST `/pedidos/:id/cancelar` | `motivo`; solo pendiente sin cobros |

El resumen acepta `page`, `limit` (máximo 200), `comercioId` y `estado`
(PENDIENTE, ENTREGADO, CANCELADO o DEUDA). Las cabeceras `X-Total-Count`,
`X-Page`, `X-Limit` y `X-Has-More` describen los pedidos paginados. Los saldos de
los comercios se calculan sobre todos sus pedidos no cancelados, independientemente
de la página o del filtro. Los cobros y su auditoría se confirman en una misma
transacción; si falla el evento, no se confirma dinero ni movimientos.

El endpoint existente `/api/reportes/resumen` agrega `prepizzas` y `resumenGeneral`. La auditoría incorpora la entidad PREPIZZA con etiquetas legibles en el panel.

## Validación

Desde `backend`, ejecutar `npm test`. Para las pruebas de integración definir `MONGODB_TEST_URI` apuntando a una base **exclusiva de pruebas**, dentro de un replica set, y `JWT_SECRET`. La suite vacía los datos de la base de prueba. Desde `panel`, ejecutar `npm run build` y `npm run lint`.

Se prueban producción con/sin ingredientes, reversión ante faltantes, bajas, entrega única, entregas concurrentes, cobros en cuotas y concurrentes, caja, permisos, seguimiento y reportes con cobros en períodos distintos.


