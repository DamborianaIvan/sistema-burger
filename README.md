# Sistema Burger

Panel interno y API para una hamburguesería. Nombre y logo provisorios.


## Alcance actual

- Delivery y takeaway habilitados. El panel obtiene las modalidades de la API al iniciar sesión.
- Autenticación, ADMIN/CAJERO/CHEF/DELIVERY, permisos y protecciones del backend conservados.
- Productos, cocina, caja, descuentos, pagos, tickets, ingredientes, recetas, stock, reportes y auditoría conservados.
- Categorías iniciales: Hamburguesas, Acompañamientos, Bebidas, Postres y Adicionales. Se pueden crear categorías propias.
- Mesas y el circuito de salón se conservan, con nuevas ventas de salón deshabilitadas en esta instalación. No se muestra su navegación ni su contador.
- Prepizzas está deshabilitado por defecto en API, navegación y reportes de ventas (`ENABLE_PREPIZZAS=false`). Se conserva su código e historial para una adaptación de producción futura; stock y recetas generales siguen activos.
- Sin sitio público, pedidos web ni despliegue en esta etapa.
- No se precargan usuarios ni menú: el administrador inicial crea los usuarios y productos de este negocio.

## Requisitos

Node.js 22.9 o posterior, npm y MongoDB 7 con replica set. Un MongoDB standalone no alcanza: incluso el administrador inicial y los cobros usan transacciones.

Para iniciar una base local nueva con Docker Desktop, desde la raíz:

```sh
docker compose up -d --wait
```

El contenedor usa un volumen propio de este proyecto y escucha en `127.0.0.1:27017`. Si ese puerto ya está ocupado, usar otra instancia o cambiar el puerto del compose y la URI. No reutilizar una base de Pepe’s.

Si ya tenés un replica set local o una base de desarrollo propia en Atlas, podés omitir Docker y configurar su URI en `backend/.env`.

## Instalación local

```sh
git clone https://github.com/DamborianaIvan/sistema-burger.git
cd sistema-burger
npm run setup
npm run install:apps
```

`setup` crea `backend/.env` y `panel/.env` si no existen. Genera un secreto JWT aleatorio nuevo para cada instalación y no sobrescribe configuraciones existentes. No imprime secretos. Estos archivos están excluidos de Git.

Configuración inicial del backend:

- Base: `sistema-burger` en el replica set local `rs0`.
- API: `http://localhost:5001`.
- Modalidades: `ORDER_TYPES=DELIVERY,TAKEAWAY`.
- CORS: `http://localhost:5174,http://127.0.0.1:5174`.
- Módulo heredado: `ENABLE_PREPIZZAS=false`.
- Panel: `http://localhost:5174`; API en puerto `5001`, separados de los puertos de Pepe’s.
- Proxy confiable: cero saltos para ejecución local directa.

Iniciar en dos terminales desde la raíz:

```sh
npm run dev:api
```

```sh
npm run dev:panel
```

Abrir **http://localhost:5174/register** y crear el primer ADMIN. Después, el registro público queda cerrado y los demás usuarios se crean desde USUARIOS. El panel usa el puerto 5174 estricto para coincidir con CORS.

El ejemplo de `.env` no es un secreto de uso real: si copiás los ejemplos manualmente en vez de ejecutar `setup`, reemplazá el marcador JWT por uno aleatorio propio.

## Actualizar una instalación existente (etapa 2)

`npm run setup` sigue sin sobrescribir tus `.env`. Conservá tu URI de Atlas y tu JWT. Ajustá únicamente estos valores en `backend/.env` si todavía usás los anteriores:

```env
PORT=5001
BASE_URL=http://localhost:5001
CORS_ORIGINS=http://localhost:5174,http://127.0.0.1:5174
ORDER_TYPES=DELIVERY,TAKEAWAY
ENABLE_PREPIZZAS=false
```

En `panel/.env`:

```env
VITE_API_URL=http://127.0.0.1:5001
```

Reiniciar ambos procesos y cerrar/iniciar sesión para recibir el perfil nuevo. Si el panel estaba en 5173, abrir ahora `http://localhost:5174`. Una variable de entorno definida en PowerShell tiene prioridad sobre el `.env`: no mantener un `PORT` o `CORS_ORIGINS` temporal con valores diferentes.

No se ejecutan migraciones ni se borra información. Las ventas mayoristas dejan de sumarse a las ventas de hamburguesería mientras el módulo esté deshabilitado. Los movimientos de caja, stock y auditoría ya registrados se conservan: desactivar el módulo no anula dinero ni movimientos históricos. La auditoría mantiene su filtro de Prepizzas marcado como histórico.

## Primer circuito de prueba

1. Como ADMIN, crear un producto en Hamburguesas y opcionalmente ingredientes y su receta.
2. Crear usuarios CAJERO, CHEF y DELIVERY desde USUARIOS.
3. Abrir caja y crear un pedido delivery con nombre, teléfono y dirección.
4. En Cocina, marcarlo listo. Con DELIVERY, marcarlo entregado.
5. Cobrar con ADMIN/CAJERO y cerrar el pedido. Revisar ticket, movimiento de caja y consumo de receta.
6. Repetir como takeaway: listo → entregado → cobro y cierre.
7. Comprobar que CHEF y DELIVERY no accedan a caja, usuarios o historial general.

Se conserva la regla original: el stock de recetas se consume al cierre del pedido y puede quedar negativo. Las variantes se pueden representar como productos separados. No se implementaron modificadores por unidad ni combos configurables.

## Verificación automática

```sh
npm test
npm run build
npm run lint
```

`npm test` usa `backend/test.env`, un perfil sin credenciales que habilita salón y Prepizzas para mantener sus pruebas de regresión. La suite específica de hamburguesería desactiva ambos y verifica delivery/takeaway de punta a punta. La prueba HTTP de modalidades usa delivery/takeaway y comprueba que forzar salón sea rechazado sin saltear autenticación ni permisos. No iniciar la API de uso manual con `test.env`.

Las suites de integración requieren `MONGODB_TEST_URI` con una base exclusiva de pruebas en un replica set; limpian sus colecciones. Debe ser distinta de la base de uso local. Por ejemplo, en PowerShell:

```powershell
$env:MONGODB_TEST_URI='mongodb://127.0.0.1:27017/sistema-burger-test?replicaSet=rs0'
npm test
```

En bash:

```sh
MONGODB_TEST_URI='mongodb://127.0.0.1:27017/sistema-burger-test?replicaSet=rs0' npm test
```

Sin esa variable no se ejecutan las suites que necesitan MongoDB. La CI inicia un replica set exclusivo y ejecuta las pruebas, build, lint y auditorías de dependencias.

## Estructura y documentación

- `backend/`: Node.js, Express 5, MongoDB, Mongoose, JWT y bcrypt.
- `panel/`: React 19, TypeScript, Vite, MUI y Recharts.
- `docs/BASE_Y_ALCANCE.md`: decisiones, procedencia y pendientes.
- `docs/SEGURIDAD.md`: protecciones heredadas y sus límites.
- `docs/PREPIZZAS.md`: referencia del circuito heredado, deshabilitado por defecto.
- `docs/PRUEBAS_HAMBURGUESERIA.md`: recorrido manual y resultados esperados de esta etapa.

`ORDER_TYPES` y `ENABLE_PREPIZZAS` se configuran solo en el backend. Al cambiarlos, reiniciar la API y volver a iniciar sesión en el panel. La API valida siempre la modalidad; cambiar localStorage no amplía permisos ni habilita ventas de salón. Los pedidos históricos y sus transiciones conservan sus reglas.

Render, Vercel, dominios, credenciales de producción y backups se definirán en una etapa posterior. Las variables `VITE_*` son públicas y no deben contener credenciales.

## Atribución

Base original de Agustina Di Natale e Ivan Damboriana. Adaptación para el proyecto independiente Sistema Burger.
