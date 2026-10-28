# Base y alcance de la adaptación

## Procedencia

Origen: `DamborianaIvan/pepes-napoli`, commit `b277de75632006d15fb8758c3d5ab35231748188` (merge del PR #25). Destino: `DamborianaIvan/sistema-burger`.

Se importó una instantánea de los archivos de código y configuración de ejemplo. No se copió la historia Git, los logos originales, archivos `.env`, bases, respaldos ni usuarios. El repositorio y los despliegues originales no se modificaron.

## Decisiones confirmadas

- Sitio del cliente fuera de alcance por ahora.
- Atención inicial delivery y takeaway.
- Logo y nombre provisorios.
- Pruebas locales del usuario antes de desplegar en Render/Vercel.
- Misma arquitectura, stack y protecciones de la base.

## Primera etapa implementada

Modalidades configuradas por `ORDER_TYPES`; validación en el servicio de creación de pedidos y propagación al panel mediante login. Salón conservado, con navegación y alta deshabilitadas para el perfil actual. Nuevo logo SVG provisorio, categorías y tickets adaptados. Configuración local independiente con generación de JWT y MongoDB opcional mediante compose con replica set.

## Segunda etapa

El circuito de prepizzas queda deshabilitado por defecto mediante `ENABLE_PREPIZZAS=false`. No se monta su API, no aparece en navegación ni en reportes de ventas y su URL del panel redirige al inicio. Los reportes de ventas excluyen las operaciones mayoristas y devuelven `prepizzas: null`. Se conservan los modelos, código, historial y permisos originales para poder revisar producción en otra etapa. Caja, stock y auditoría conservan los movimientos históricos; su desactivación no revierte operaciones.

Los puertos iniciales se separan: API 5001 y panel 5174 estricto, con orígenes locales explícitos. El arranque informa puerto, PID y orígenes efectivos, sin secretos. Si el puerto está ocupado, falla y cierra la conexión MongoDB en vez de anunciar una API iniciada.

Las pruebas generales conservan el perfil completo mediante `test.env`, mientras una suite de negocio ejecuta delivery/takeaway con Prepizzas deshabilitado. No se cambian recetas, stock ni credenciales del usuario.

## Pendientes de decisión

Menú definitivo, precios, recetas, variantes, extras por unidad, combos configurables, producción de medallones/preparaciones, venta a comercios y política de stock. No se agregaron funcionalidades para resolver estas decisiones sin definirlas.

## Protecciones conservadas

JWT HS256 con secreto obligatorio, usuario activo recargado desde DB, revocación de sesiones, límites de login, bootstrap único de ADMIN, permisos backend y proyección limitada de datos para CHEF/DELIVERY. Se mantienen las transacciones y auditorías críticas existentes. El perfil de regresión prueba también las funcionalidades conservadas de salón.

## Límites

La configuración del negocio que recibe el panel no reemplaza la autorización del servidor. La existencia de archivos y pruebas no certifica un despliegue. No hay producción configurada ni evidencia de backups de este negocio. El stock mantiene consumo al cierre y posibilidad de saldo negativo. No existe personalización estructurada por unidad ni composición comercial de combos.
