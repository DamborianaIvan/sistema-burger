# Correcciones de seguridad de la API

## Despliegue

- Usar MongoDB Atlas o un replica set: el alta inicial, los cobros tradicionales,
  las anulaciones y los movimientos de stock necesitan transacciones. No se usa una alternativa
  sin transacciones cuando la base no las soporta.
- En Render configurar `TRUST_PROXY=1` si hay exactamente un proxy entre Internet
  y Express. Para ejecutar la API directamente usar `TRUST_PROXY=0` (valor por
  defecto). Nunca aumentar los saltos sin verificar la infraestructura: permitiría
  confiar en una IP enviada por el cliente.
- Mantener `JWT_SECRET` aleatorio, con al menos 32 caracteres, y limitar
  `CORS_ORIGINS` a los dominios usados por el cliente. CORS no sustituye la
  autenticación ni restringe herramientas externas al navegador.
- El backend debe poder crear índices. `IntentoAcceso` y `SesionRevocada` usan
  índices TTL para eliminar ventanas vencidas y revocaciones de tokens expirados.
- No se necesita modificar los usuarios existentes: la versión de sesión inicial
  se interpreta como cero. Los tokens anteriores siguen sujetos a su vencimiento
  y se invalidan al cambiar contraseña, rol o estado del usuario.
- La nueva colección `Bootstrap` conserva el cierre del alta inicial. No borrarla
  para habilitar un registro público; recuperar administradores por un procedimiento
  controlado sobre la base.

## Peticiones y acceso

Se rechazan cuerpos comprimidos con HTTP 415, JSON inválido o cuerpos distintos de
un objeto con HTTP 400 y cuerpos mayores a 1 MiB con HTTP 413. Las dependencias
del backend se actualizaron y se quitaron `multer` y `swagger-jsdoc`, sin uso.

El login valida tipos y longitudes antes de consultar usuarios. Las ventanas de
15 minutos permiten hasta 100 peticiones por IP y diez intentos por cuenta; los
accesos exitosos se descuentan del contador de cuenta. El límite por IP también
cubre cuerpos de credenciales inválidos. El alta inicial permite diez intentos
por IP por ventana. Un bloqueo devuelve HTTP 429 y `Retry-After` en segundos.

Los contadores se actualizan atómicamente en MongoDB, son compartidos entre
instancias y persisten al reiniciar el backend. Guardan resúmenes SHA-256 de las
claves, sin contraseñas ni IP o nombre de usuario en claro. Si no es posible
consultar el límite, el acceso falla con HTTP 503.

## Cobros y anulaciones

La lectura del pedido, la comprobación de su estado, el incremento de totales de
caja, la creación de movimientos y el guardado del pago forman una sola
transacción. Las anulaciones usan el mismo mecanismo y solo descuentan dinero
de la caja abierta que recibió el pago. Un fallo revierte todas esas escrituras.

Los cobros concurrentes del mismo pedido se serializan: uno se confirma y los
restantes reciben HTTP 409. Los cobros de pedidos diferentes usan incrementos atómicos sobre la misma caja. El cierre de caja
comprueba que sigue abierta y que sus totales no cambiaron desde la lectura.
Los pedidos usan control optimista de versión para impedir que una edición o
cancelación basada en datos anteriores sobrescriba un cobro reciente.

## Sesiones

Cambiar contraseña, rol o estado incrementa la versión de sesión del usuario.
Desactivar y volver a activar una cuenta no reactiva sus tokens anteriores.

`POST /api/auth/logout` requiere el token Bearer y devuelve HTTP 204. Se guarda
su resumen SHA-256 hasta su vencimiento; el token deja de ser válido en el
servidor y las demás sesiones del usuario permanecen activas. Cada login emite
un identificador único, incluso si sucede en el mismo segundo. El panel espera
la confirmación antes de borrar la sesión local y permite reintentar si falla
la conexión. Un token ya inválido permite limpiar la sesión local.

## Validaciones

- Contraseñas nuevas: ocho caracteres como mínimo y 72 bytes UTF-8 como máximo,
  para evitar el truncamiento silencioso de bcrypt.
- Identidades: texto limitado y formato de email validado en alta y edición.
- Pedidos: entre uno y cien productos sin repetir; cantidades enteras seguras
  entre uno y un millón, textos limitados e importes finitos.
- Importes de pedidos, pagos y arqueos: hasta 100.000.000; precios nuevos de
  producto desde 0,01. Los pagos deben sumar exactamente el total final.
- Productos: mismas validaciones al crear y editar; nombre tratado literalmente
  en las búsquedas, sin interpretar expresiones regulares.

## Fases del roadmap

### Fase 1: superficie y permisos — implementada

- Productos y categorías requieren sesión ADMIN o CAJERO. Mesas e historial
  general de pedidos también quedan limitados a esos roles.
- CHEF entra directamente a Cocina; solo recibe productos, cantidades, notas,
  estado y mesa, sin identidad/contacto del cliente ni información financiera.
  Solo puede marcar como listo un pedido en cocina.
- DELIVERY recibe los pedidos listos/en camino que necesita entregar, con
  contacto y dirección, sin precios, cobros, totales ni datos de otros operadores.
  Las respuestas de las mutaciones usan la misma selección explícita de campos.
- Swagger no se monta con `NODE_ENV=production`; continúa disponible en local.
  El healthcheck público devuelve únicamente `status` y HTTP 200/503.

Esto no convierte el alojamiento en una red privada: conocer la URL no debe
conceder acceso a los datos. El alta inicial sigue cerrada después del primer ADMIN.

### Fase 2: auditoría crítica — implementada

Cobros y anulaciones, descuentos, apertura y
cierre de caja y altas/cambios de usuarios escriben su auditoría dentro de la
misma transacción. Si falla el evento, la operación completa se revierte y se
responde HTTP 503. No se guardan contraseñas ni tokens en los detalles.

La colección `ControlOperacion` serializa los cambios de personal y vuelve a
comprobar los permisos del administrador dentro de la transacción. Evita que dos
administradores se desactiven mutuamente y dejen el sistema sin acceso. No borrar
esta colección durante la operación normal.

La auditoría de otras acciones (por ejemplo cambios operativos de estado,
catálogo y ajustes de stock) conserva el comportamiento de mejor esfuerzo.
Hacerla obligatoria también es una mejora futura, sin tratarla como un requisito
para el uso actual de esta hamburguesería. Los datos de negocio y sus movimientos de
stock/mesa sí se mantienen transaccionales según las fases anteriores.

### Fase 3: consultas y crecimiento del historial — implementada

Los listados de pedidos, cocina, reparto, auditoría y movimientos de caja/stock
aceptan `page` y `limit` (1–200).
Devuelven `X-Total-Count`, `X-Page`, `X-Limit` y `X-Has-More`, expuestos en CORS.
Se conservan las respuestas de tipo array salvo los resúmenes, que mantienen sus
objetos. Los clientes que antes asumían un historial completo deben paginar.

El límite por defecto es 50, excepto auditoría (100) y movimientos de stock
(200). Los parámetros desconocidos, objetos/arrays, enteros inválidos y saltos de
más de 100.000 registros se rechazan; para pedidos antiguos se debe acotar el
rango de fechas (máximo 366 días). El orden incluye `_id` como desempate. Es
paginación por desplazamiento: con escrituras concurrentes puede variar la
composición entre páginas; no es un mecanismo de exportación contable.

Pedidos admite `tipoPedido`, `estadoPedido`, `activos=true`, `cliente` literal,
`metodoPago` y `desde`/`hasta` en formato YYYY-MM-DD. Los filtros se aplican en el
servidor antes de paginar. Caja consulta todos los pendientes, incluso de días
anteriores. El plano de mesas consulta únicamente pedidos activos de salón; si
superan 200, muestra un error para evitar presentar un plano incompleto.

`GET /api/pedidos/resumen` agrega los indicadores del inicio en el servidor con
el día y mes de Argentina. La página de pedidos de hoy no condiciona los
conteos. Los maestros pequeños (mesas y productos) siguen completos.

### Fase 4: producción y recuperación — pendiente de evidencia privada

Comprobar backups habilitados, fecha del último respaldo, retención y alertas;
restaurar una copia en una base separada y validar datos e índices. Revisar
credenciales/permisos de MongoDB, accesos de red, `NODE_ENV`, orígenes CORS,
`TRUST_PROXY` real y protección de las cuentas de los proveedores.

No se accedió a las consolas privadas ni se verificó una restauración real.
Ver el procedimiento y la evidencia disponible en
[revisión de producción](REVISION_PRODUCCION.md). Esta fase debe cerrarse antes de
considerar verificada la recuperación del negocio; un healthcheck exitoso no
prueba que exista un backup.

El proyecto conserva únicamente backend y panel. Ambos tienen auditoría de
dependencias en CI; el panel también ejecuta build y lint. `npm audit` refleja
los avisos disponibles al ejecutar el comando, no una garantía permanente.

## Verificación

Ejecutar `npm ci` y `npm test` en `backend`, con `JWT_SECRET` y
`MONGODB_TEST_URI` apuntando exclusivamente a una base de pruebas en replica set.
La suite elimina datos de esa base. Incluye errores de parser, inyección de
operadores en login, límites por IP/cuenta, bootstrap concurrente, revocación de
sesiones, cobros y anulaciones simultáneos, fallo intermedio con rollback,
competencia con el cierre de caja y consumo único de ingredientes.

En `panel`, ejecutar `npm ci`, `npm run build` y `npm run lint`.

