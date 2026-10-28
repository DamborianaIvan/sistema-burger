const json = (schema) => ({ 'application/json': { schema } });
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const auth = [{ bearerAuth: [] }];
const id = { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'ID MongoDB' };
const error = (description) => ({ description, content: json(ref('Error')) });
const secured = (responses) => ({ 401: { $ref: '#/components/responses/Unauthorized' }, ...responses });

export const paths = {
  '/api/health': {
    get: {
      tags: ['Health'],
      summary: 'Consultar estado del servicio',
      responses: {
        200: {
          description: 'Servicio operativo y base conectada',
          content: json({
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['ok'], example: 'ok' }
            }
          })
        },
        503: { description: 'Servicio degradado', content: json({ type: 'object', properties: { status: { type: 'string', enum: ['degraded'] } } }) }
      }
    }
  },
  '/api/usuarios': {
    get: { tags: ['Usuarios'], summary: 'Listar usuarios', security: auth, responses: secured({ 200: { description: 'Lista de usuarios', content: json({ type: 'array', items: { type: 'object' } }) }, 403: { $ref: '#/components/responses/Forbidden' } }) },
    post: { tags: ['Usuarios'], summary: 'Crear usuario', security: auth, requestBody: { required: true, content: json({ type: 'object', required: ['nombre', 'nombreUsuario', 'email', 'password', 'rol'], properties: { nombre: { type: 'string' }, nombreUsuario: { type: 'string' }, email: { type: 'string', format: 'email' }, password: { type: 'string', format: 'password' }, rol: { type: 'string', enum: ['ADMIN', 'CAJERO', 'CHEF', 'DELIVERY'] } } }) }, responses: secured({ 201: { description: 'Usuario creado' }, 400: error('Datos inválidos'), 409: error('Usuario duplicado') }) }
  },
  '/api/usuarios/{id}': {
    patch: { tags: ['Usuarios'], summary: 'Editar usuario o rol', security: auth, parameters: [id], requestBody: { required: true, content: json({ type: 'object' }) }, responses: secured({ 200: { description: 'Usuario actualizado' }, 400: error('Datos inválidos'), 403: { $ref: '#/components/responses/Forbidden' }, 404: { $ref: '#/components/responses/NotFound' }, 409: error('Operación no permitida') }) }
  },
  '/api/usuarios/{id}/estado': {
    patch: { tags: ['Usuarios'], summary: 'Activar o desactivar usuario', security: auth, parameters: [id], requestBody: { required: true, content: json({ type: 'object', required: ['activo'], properties: { activo: { type: 'boolean' } } }) }, responses: secured({ 200: { description: 'Estado actualizado' }, 403: { $ref: '#/components/responses/Forbidden' }, 404: { $ref: '#/components/responses/NotFound' }, 409: error('Operación no permitida') }) }
  },
  '/api/usuarios/{id}/password': {
    patch: { tags: ['Usuarios'], summary: 'Cambiar contraseña', security: auth, parameters: [id], requestBody: { required: true, content: json({ type: 'object', required: ['password'], properties: { password: { type: 'string', format: 'password' } } }) }, responses: secured({ 200: { description: 'Contraseña actualizada' }, 400: error('Contraseña inválida'), 404: { $ref: '#/components/responses/NotFound' } }) }
  },

  '/api/auth/register': { post: { tags: ['Auth'], summary: 'Registrar usuario', requestBody: { required: true, content: json({ type: 'object', required: ['nombre', 'nombreUsuario', 'email', 'password'], properties: { nombre: { type: 'string' }, nombreUsuario: { type: 'string' }, email: { type: 'string', format: 'email' }, password: { type: 'string', format: 'password' }, rol: { type: 'string', enum: ['admin'] } } }) }, responses: { 201: { description: 'Usuario creado', content: json({ type: 'object', properties: { message: { type: 'string' } } }) }, 400: error('Nombre de usuario en uso'), 500: error('Error interno') } } },
  '/api/auth/login': { post: { tags: ['Auth'], summary: 'Iniciar sesión', requestBody: { required: true, content: json({ type: 'object', required: ['nombreUsuario', 'password'], properties: { nombreUsuario: { type: 'string' }, password: { type: 'string', format: 'password' } } }) }, responses: { 200: { description: 'JWT emitido', content: json(ref('TokenResponse')) }, 400: error('Credenciales incorrectas'), 500: error('Error interno') } } },
  '/api/productos': {
    get: { tags: ['Productos'], summary: 'Listar productos', responses: { 200: { description: 'Lista de productos', content: json({ type: 'array', items: ref('Producto') }) }, 500: error('Error interno') } },
    post: { tags: ['Productos'], summary: 'Crear producto', security: auth, requestBody: { required: true, content: json(ref('Producto')) }, responses: secured({ 201: { description: 'Producto creado', content: json({ type: 'object', properties: { message: { type: 'string' }, producto: ref('Producto') } }) }, 400: error('Datos inválidos'), 403: { $ref: '#/components/responses/Forbidden' }, 409: error('Producto duplicado'), 500: error('Error interno') }) }
  },
  '/api/productos/{id}': {
    get: { tags: ['Productos'], summary: 'Obtener producto', parameters: [id], responses: { 200: { description: 'Producto', content: json(ref('Producto')) }, 404: { $ref: '#/components/responses/NotFound' }, 500: error('Error interno') } },
    put: { tags: ['Productos'], summary: 'Actualizar producto', security: auth, parameters: [id], requestBody: { required: true, content: json(ref('Producto')) }, responses: secured({ 200: { description: 'Producto actualizado', content: json({ type: 'object', properties: { message: { type: 'string' }, producto: ref('Producto') } }) }, 403: { $ref: '#/components/responses/Forbidden' }, 404: { $ref: '#/components/responses/NotFound' }, 500: error('Error interno') }) },
    delete: { tags: ['Productos'], summary: 'Eliminar producto', security: auth, parameters: [id], responses: secured({ 200: { description: 'Producto eliminado', content: json({ type: 'object', properties: { message: { type: 'string' } } }) }, 403: { $ref: '#/components/responses/Forbidden' }, 404: { $ref: '#/components/responses/NotFound' }, 500: error('Error interno') }) }
  },
  '/api/productos/{id}/disponible': { patch: { tags: ['Productos'], summary: 'Cambiar disponibilidad', security: auth, parameters: [id], requestBody: { required: true, content: json({ type: 'object', required: ['disponible'], properties: { disponible: { type: 'boolean' } } }) }, responses: secured({ 200: { description: 'Disponibilidad actualizada', content: json({ type: 'object', properties: { message: { type: 'string' }, producto: ref('Producto') } }) }, 400: error('Valor inválido'), 403: { $ref: '#/components/responses/Forbidden' }, 404: { $ref: '#/components/responses/NotFound' }, 500: error('Error interno') }) } },

  '/api/stock/ingredientes': {
    get: {
      tags: ['Stock'],
      summary: 'Listar ingredientes y estado de stock',
      security: auth,
      responses: secured({
        200: { description: 'Ingredientes', content: json({ type: 'array', items: ref('Ingrediente') }) },
        403: { $ref: '#/components/responses/Forbidden' }
      })
    },
    post: {
      tags: ['Stock'],
      summary: 'Crear ingrediente',
      security: auth,
      requestBody: {
        required: true,
        content: json({
          type: 'object',
          required: ['nombre', 'unidad'],
          properties: {
            nombre: { type: 'string' },
            unidad: { type: 'string', enum: ['G', 'KG', 'ML', 'L', 'UNIDAD'] },
            stockMinimo: { type: 'number', minimum: 0 },
            stockInicial: { type: 'number', minimum: 0 }
          }
        })
      },
      responses: secured({
        201: { description: 'Ingrediente creado', content: json(ref('Ingrediente')) },
        400: error('Datos inválidos'),
        409: error('Ingrediente duplicado')
      })
    }
  },
  '/api/stock/ingredientes/{id}': {
    patch: {
      tags: ['Stock'],
      summary: 'Editar ingrediente sin modificar stock directamente',
      security: auth,
      parameters: [id],
      requestBody: { required: true, content: json({ type: 'object' }) },
      responses: secured({
        200: { description: 'Ingrediente actualizado', content: json(ref('Ingrediente')) },
        404: { $ref: '#/components/responses/NotFound' },
        409: error('Cambio incompatible con historial')
      })
    }
  },
  '/api/stock/ingredientes/{id}/estado': {
    patch: {
      tags: ['Stock'],
      summary: 'Activar o desactivar ingrediente',
      security: auth,
      parameters: [id],
      requestBody: {
        required: true,
        content: json({
          type: 'object',
          required: ['activo'],
          properties: { activo: { type: 'boolean' } }
        })
      },
      responses: secured({
        200: { description: 'Estado actualizado', content: json(ref('Ingrediente')) },
        404: { $ref: '#/components/responses/NotFound' },
        409: error('Ingrediente usado por receta activa')
      })
    }
  },
  '/api/stock/ingredientes/{id}/movimientos': {
    post: {
      tags: ['Stock'],
      summary: 'Registrar entrada, salida, ajuste o merma',
      security: auth,
      parameters: [id],
      requestBody: {
        required: true,
        content: json({
          type: 'object',
          required: ['tipo'],
          properties: {
            tipo: { type: 'string', enum: ['ENTRADA', 'SALIDA', 'AJUSTE', 'MERMA'] },
            cantidad: { type: 'number', exclusiveMinimum: 0 },
            stockObjetivo: { type: 'number', minimum: 0 },
            motivo: { type: 'string' }
          }
        })
      },
      responses: secured({
        201: { description: 'Movimiento registrado' },
        400: error('Movimiento inválido'),
        409: error('Movimiento incompatible con stock actual')
      })
    }
  },
  '/api/stock/movimientos': {
    get: {
      tags: ['Stock'],
      summary: 'Listar últimos movimientos de stock',
      security: auth,
      responses: secured({
        200: { description: 'Movimientos', content: json({ type: 'array', items: ref('MovimientoStock') }) }
      })
    }
  },
  '/api/stock/alertas': {
    get: {
      tags: ['Stock'],
      summary: 'Listar ingredientes con stock bajo',
      security: auth,
      responses: secured({
        200: { description: 'Alertas de stock', content: json({ type: 'array', items: ref('Ingrediente') }) }
      })
    }
  },
  '/api/stock/recetas': {
    get: {
      tags: ['Stock'],
      summary: 'Listar recetas',
      security: auth,
      responses: secured({
        200: { description: 'Recetas', content: json({ type: 'array', items: ref('Receta') }) }
      })
    }
  },
  '/api/stock/recetas/{id}': {
    put: {
      tags: ['Stock'],
      summary: 'Crear o reemplazar receta de un producto',
      security: auth,
      parameters: [id],
      requestBody: {
        required: true,
        content: json({
          type: 'object',
          required: ['componentes'],
          properties: {
            componentes: {
              type: 'array',
              minItems: 1,
              items: ref('ComponenteReceta')
            }
          }
        })
      },
      responses: secured({
        200: { description: 'Receta guardada', content: json(ref('Receta')) },
        404: { $ref: '#/components/responses/NotFound' },
        409: error('Ingrediente inexistente o inactivo')
      })
    }
  },
  '/api/stock/recetas/{id}/estado': {
    patch: {
      tags: ['Stock'],
      summary: 'Activar o desactivar receta',
      security: auth,
      parameters: [id],
      requestBody: {
        required: true,
        content: json({
          type: 'object',
          required: ['activa'],
          properties: { activa: { type: 'boolean' } }
        })
      },
      responses: secured({
        200: { description: 'Receta actualizada', content: json(ref('Receta')) },
        404: { $ref: '#/components/responses/NotFound' }
      })
    }
  },
  '/api/pedidos': {
    get: { tags: ['Pedidos'], summary: 'Listar pedidos', security: auth, responses: secured({ 200: { description: 'Lista de pedidos', content: json({ type: 'array', items: ref('Pedido') }) }, 500: error('Error interno') }) },
    post: { tags: ['Pedidos'], summary: 'Crear pedido', security: auth, requestBody: { required: true, content: json(ref('PedidoCreate')) }, responses: secured({ 201: { description: 'Pedido creado', content: json(ref('Pedido')) }, 400: error('Datos inválidos'), 404: { $ref: '#/components/responses/NotFound' }, 409: error('Mesa ocupada o producto no disponible'), 500: error('Error interno') }) }
  },
  '/api/pedidos/delivery': {
    get: {
      tags: ['Pedidos'],
      summary: 'Listar entregas disponibles para DELIVERY',
      security: auth,
      responses: secured({
        200: { description: 'Pedidos delivery listos para reparto', content: json({ type: 'array', items: ref('Pedido') }) },
        403: { $ref: '#/components/responses/Forbidden' }
      })
    }
  },
  '/api/pedidos/delivery/{id}/entregado': {
    patch: {
      tags: ['Pedidos'],
      summary: 'Marcar una entrega disponible como entregada',
      security: auth,
      parameters: [id],
      responses: secured({
        200: { description: 'Pedido marcado como entregado', content: json(ref('Pedido')) },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
        409: error('Pedido no disponible para entrega')
      })
    }
  },
  '/api/pedidos/cocina': {
    get: {
      tags: ['Pedidos'],
      summary: 'Listar pedidos en cocina',
      security: auth,
      responses: secured({
        200: { description: 'Pedidos en cocina', content: json({ type: 'array', items: ref('Pedido') }) },
        403: { $ref: '#/components/responses/Forbidden' },
        500: error('Error interno')
      })
    }
  },
  '/api/pedidos/{id}/ticket/venta': {
    get: {
      tags: ['Tickets'],
      summary: 'Generar comprobante de venta',
      security: auth,
      parameters: [id],
      responses: secured({
        200: { description: 'Comprobante de venta', content: json(ref('TicketVenta')) },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
        409: error('Pedido no pagado o cancelado')
      })
    }
  },
  '/api/pedidos/{id}/listo': {
    patch: {
      tags: ['Pedidos'],
      summary: 'Marcar pedido como listo desde cocina',
      security: auth,
      parameters: [id],
      responses: secured({
        200: { description: 'Pedido marcado como listo', content: json(ref('Pedido')) },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
        409: error('Pedido no está en cocina')
      })
    }
  },
  '/api/pedidos/{id}': { get: { tags: ['Pedidos'], summary: 'Obtener pedido', security: auth, parameters: [id], responses: secured({ 200: { description: 'Pedido', content: json(ref('Pedido')) }, 404: { $ref: '#/components/responses/NotFound' }, 500: error('Error interno') }) }, delete: { tags: ['Pedidos'], summary: 'Eliminar pedido', security: auth, parameters: [id], responses: secured({ 200: { description: 'Pedido eliminado', content: json({ type: 'object', properties: { message: { type: 'string' } } }) }, 404: { $ref: '#/components/responses/NotFound' }, 500: error('Error interno') }) } },
  '/api/pedidos/{id}/estado': { patch: { tags: ['Pedidos'], summary: 'Actualizar estado de pedido', security: auth, parameters: [id], requestBody: { required: true, content: json(ref('EstadoPedido')) }, responses: secured({ 200: { description: 'Pedido actualizado', content: json(ref('Pedido')) }, 400: error('Estado inválido'), 404: { $ref: '#/components/responses/NotFound' }, 409: error('Transición de estado no permitida'), 500: error('Error interno') }) } },
  '/api/pedidos/{id}/descuento': { patch: { tags: ['Pedidos'], summary: 'Aplicar descuento porcentual', security: auth, parameters: [id], requestBody: { required: true, content: json({ type: 'object', required: ['porcentaje'], properties: { porcentaje: { type: 'number', minimum: 0, maximum: 100 } } }) }, responses: secured({ 200: { description: 'Descuento aplicado', content: json(ref('Pedido')) }, 400: error('Porcentaje inválido'), 409: error('Pedido no admite descuento') }) } },
  '/api/pedidos/{id}/cobrar': { post: { tags: ['Pedidos'], summary: 'Registrar cobro completo dividido por medios', security: auth, parameters: [id], requestBody: { required: true, content: json({ type: 'object', required: ['pagos'], properties: { pagos: { type: 'array', minItems: 1, items: ref('PagoPedido') } } }) }, responses: secured({ 200: { description: 'Cobro registrado', content: json(ref('Pedido')) }, 409: error('Caja cerrada o suma de pagos inválida') }) } },
  '/api/pedidos/{id}/anular-cobro': { post: { tags: ['Pedidos'], summary: 'Anular cobro completo conservando historial', security: auth, parameters: [id], responses: secured({ 200: { description: 'Cobro anulado', content: json(ref('Pedido')) }, 409: error('Cobro no anulable') }) } },
  '/api/pedidos/{id}/cerrar': { post: { tags: ['Pedidos'], summary: 'Cerrar pedido pagado, liberar mesa y consumir receta', security: auth, parameters: [id], responses: secured({ 200: { description: 'Pedido cerrado', content: json(ref('Pedido')) }, 409: error('Pedido no está listo para cierre') }) } },
  '/api/auditoria': {
    get: {
      tags: ['Auditoría'],
      summary: 'Listar eventos de auditoría',
      security: auth,
      parameters: [
        { name: 'entidad', in: 'query', required: false, schema: { type: 'string', enum: ['PEDIDO', 'CAJA', 'STOCK', 'USUARIO', 'PRODUCTO'] } },
        { name: 'accion', in: 'query', required: false, schema: { type: 'string' } },
        { name: 'entidadId', in: 'query', required: false, schema: { type: 'string' } },
        { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 200, default: 100 } }
      ],
      responses: secured({
        200: { description: 'Eventos más recientes', content: json({ type: 'array', items: ref('AuditLog') }) },
        400: error('Filtro inválido'),
        403: { $ref: '#/components/responses/Forbidden' }
      })
    }
  },
  '/api/reportes/resumen': {
    get: {
      tags: ['Reportes'],
      summary: 'Obtener resumen consolidado de ventas, caja y stock',
      security: auth,
      parameters: [
        { name: 'desde', in: 'query', required: true, schema: { type: 'string', format: 'date' }, description: 'Fecha inicial YYYY-MM-DD en horario de Argentina' },
        { name: 'hasta', in: 'query', required: true, schema: { type: 'string', format: 'date' }, description: 'Fecha final inclusiva YYYY-MM-DD en horario de Argentina' }
      ],
      responses: secured({
        200: { description: 'Resumen del período', content: json(ref('ReporteResumen')) },
        400: error('Rango de fechas inválido'),
        403: { $ref: '#/components/responses/Forbidden' }
      })
    }
  },
  '/api/caja/actual': { get: { tags: ['Caja'], summary: 'Obtener caja abierta', security: auth, responses: secured({ 200: { description: 'Caja abierta o null', content: json(ref('Caja')) }, 403: { $ref: '#/components/responses/Forbidden' } }) } },
  '/api/caja/abrir': { post: { tags: ['Caja'], summary: 'Abrir caja', security: auth, requestBody: { required: true, content: json({ type: 'object', required: ['montoInicial'], properties: { montoInicial: { type: 'number', minimum: 0 } } }) }, responses: secured({ 201: { description: 'Caja abierta', content: json(ref('Caja')) }, 409: error('Ya existe una caja abierta') }) } },
  '/api/caja/cerrar': { post: { tags: ['Caja'], summary: 'Cerrar caja y calcular arqueo', security: auth, requestBody: { required: true, content: json({ type: 'object', required: ['efectivoDeclarado'], properties: { efectivoDeclarado: { type: 'number', minimum: 0 } } }) }, responses: secured({ 200: { description: 'Caja cerrada', content: json(ref('Caja')) }, 409: error('No hay caja abierta') }) } },
  '/api/caja/{id}/movimientos': { get: { tags: ['Caja'], summary: 'Listar movimientos de caja', security: auth, parameters: [id], responses: secured({ 200: { description: 'Movimientos de caja', content: json({ type: 'array', items: { type: 'object' } }) }, 404: { $ref: '#/components/responses/NotFound' } }) } },
  '/api/mesas': { get: { tags: ['Mesas'], summary: 'Listar mesas', security: auth, responses: secured({ 200: { description: 'Lista de mesas', content: json({ type: 'array', items: ref('Mesa') }) }, 500: error('Error interno') }) }, post: { tags: ['Mesas'], summary: 'Crear mesa', security: auth, requestBody: { required: true, content: json(ref('Mesa')) }, responses: secured({ 201: { description: 'Mesa creada', content: json(ref('Mesa')) }, 400: error('Datos de mesa inválidos'), 409: error('Número de mesa duplicado'), 500: error('Error interno') }) } },
  '/api/mesas/layout': {
    patch: {
      tags: ['Mesas'],
      summary: 'Guardar layout completo del salón',
      security: auth,
      requestBody: {
        required: true,
        content: json({
          type: 'object',
          required: ['mesas'],
          properties: {
            mesas: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                required: ['id', 'layout'],
                properties: {
                  id: { type: 'string' },
                  layout: ref('MesaLayout')
                }
              }
            }
          }
        })
      },
      responses: secured({
        200: { description: 'Plano actualizado' },
        400: error('Layout inválido'),
        403: { $ref: '#/components/responses/Forbidden' },
        404: error('Mesa inexistente')
      })
    }
  },
  '/api/mesas/{id}': { get: { tags: ['Mesas'], summary: 'Obtener mesa', security: auth, parameters: [id], responses: secured({ 200: { description: 'Mesa', content: json(ref('Mesa')) }, 404: { $ref: '#/components/responses/NotFound' }, 500: error('Error interno') }) }, put: { tags: ['Mesas'], summary: 'Actualizar mesa', security: auth, parameters: [id], requestBody: { required: true, content: json(ref('Mesa')) }, responses: secured({ 200: { description: 'Mesa actualizada', content: json(ref('Mesa')) }, 404: { $ref: '#/components/responses/NotFound' }, 500: error('Error interno') }) }, delete: { tags: ['Mesas'], summary: 'Retirar mesa del salón preservando historial', security: auth, parameters: [id], responses: secured({ 200: { description: 'Mesa eliminada o archivada', content: json({ type: 'object', properties: { message: { type: 'string' }, modo: { type: 'string', enum: ['ELIMINADA', 'ARCHIVADA'] } } }) }, 400: error('ID inválido'), 404: { $ref: '#/components/responses/NotFound' }, 409: error('Mesa ocupada o con pedido activo'), 500: error('Error interno') }) } },
  '/api/mesas/{id}/estado': { patch: { tags: ['Mesas'], summary: 'Actualizar estado de mesa', security: auth, parameters: [id], requestBody: { required: true, content: json(ref('EstadoMesa')) }, responses: secured({ 200: { description: 'Estado actualizado', content: json({ type: 'object', properties: { message: { type: 'string' }, mesa: ref('Mesa') } }) }, 404: { $ref: '#/components/responses/NotFound' }, 500: error('Error interno') }) } }
};


// Contratos comunes de los listados acotados.
paths['/api/pedidos/resumen'] = {
  get: {
    tags: ['Pedidos'], summary: 'Indicadores del día/mes de Argentina y pedidos de hoy (ADMIN/CAJERO)', security: auth,
    responses: secured({ 200: { description: 'Indicadores completos independientes de la página', content: json({ type: 'object', properties: {
      resumen: { type: 'object', properties: Object.fromEntries(['totalMes', 'pedidosDia', 'pedidosAbiertos', 'salonActivos', 'deliveryActivos', 'takeawayActivos'].map(c => [c, { type: 'integer' }])) },
      pedidos: { type: 'array', items: ref('Pedido') }
    } }) } })
  }
};
for (const [ruta, defecto] of [
  ['/api/pedidos', 50], ['/api/pedidos/resumen', 50], ['/api/pedidos/cocina', 50],
  ['/api/pedidos/delivery', 50], ['/api/auditoria', 100], ['/api/stock/movimientos', 200],
  ['/api/caja/{id}/movimientos', 50]
]) {
  const get = paths[ruta]?.get;
  if (!get) continue;
  get.parameters = [...(get.parameters ?? []).filter(p => !['limit', 'page'].includes(p.name)),
    { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 10000, default: 1 } },
    { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200, default: defecto } }
  ];
  get.description = `${get.description ?? ''} Máximo 100.000 registros de desplazamiento; los parámetros desconocidos se rechazan. Orden estable con desempate por ID; puede variar entre páginas si ingresan escrituras.`;
  get.responses[400] = error('Parámetros o filtros inválidos');
  get.responses[200].headers = Object.fromEntries(['X-Total-Count', 'X-Page', 'X-Limit', 'X-Has-More'].map(name => [name, { schema: { type: name === 'X-Has-More' ? 'boolean' : 'integer' } }]));
}
for (const ruta of ['/api/productos', '/api/productos/{id}']) {
  paths[ruta].get.security = auth;
  paths[ruta].get.responses = secured(paths[ruta].get.responses);
  paths[ruta].get.responses[403] = { $ref: '#/components/responses/Forbidden' };
}
paths['/api/pedidos'].get.parameters.push(
  ...['tipoPedido', 'estadoPedido', 'cliente', 'metodoPago'].map(name => ({ name, in: 'query', schema: { type: 'string' } })),
  { name: 'activos', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
  ...['desde', 'hasta'].map(name => ({ name, in: 'query', schema: { type: 'string', format: 'date' }, description: 'Ambas fechas requeridas; máximo 366 días, zona Argentina' }))
);
paths['/api/pedidos/cocina'].get.description += ' CHEF recibe solo preparación, mesa y notas; sin identidad, contacto ni finanzas.';
paths['/api/pedidos/delivery'].get.description += ' DELIVERY recibe contacto y dirección; sin precios, pagos, totales ni operador.';
// Estos roles tienen un DTO reducido; no se promete el contrato financiero completo.
const pedidoEntrega = { type: 'object', description: 'Datos operativos de entrega y contacto, sin información financiera' };
paths['/api/pedidos/delivery'].get.responses[200].content = json({ type: 'array', items: pedidoEntrega });
paths['/api/pedidos/delivery/{id}/entregado'].patch.responses[200].content = json(pedidoEntrega);
paths['/api/pedidos/cocina'].get.responses[200].content = json({ type: 'array', items: { type: 'object', description: 'Pedido completo para ADMIN/CAJERO; datos de preparación para CHEF' } });

