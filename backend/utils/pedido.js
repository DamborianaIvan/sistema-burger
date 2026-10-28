import { TIPOS_PEDIDO } from '../constants/pedido.js';
import { ApiError } from './apiError.js';
import { numero, texto } from './validaciones.js';

const textoNoVacio = (value) => typeof value === 'string' && value.trim().length > 0;

export const validarDatosClientePedido = ({
  tipoPedido,
  nombreCliente,
  telefono,
  direccion,
  comentario
}) => {
  for (const [campo, valor, max] of [['nombreCliente', nombreCliente, 100], ['telefono', telefono, 60], ['direccion', direccion, 200], ['comentario', comentario, 1000]]) {
    if (valor !== undefined && valor !== null) texto(valor, campo, { max });
  }
  if (tipoPedido === TIPOS_PEDIDO.DELIVERY) {
    if (!textoNoVacio(nombreCliente) || !textoNoVacio(telefono) || !textoNoVacio(direccion)) {
      throw new ApiError(400, 'Los pedidos de delivery requieren nombre, teléfono y dirección', {
        fields: ['nombreCliente', 'telefono', 'direccion']
      });
    }
  }

  if (tipoPedido === TIPOS_PEDIDO.TAKEAWAY) {
    if (!textoNoVacio(nombreCliente) || !textoNoVacio(telefono)) {
      throw new ApiError(400, 'Los pedidos takeaway requieren nombre y teléfono', {
        fields: ['nombreCliente', 'telefono']
      });
    }
  }
};

const validarItems = (productos) => {
  if (!Array.isArray(productos) || !productos.length || productos.length > 100) {
    throw new ApiError(400, 'El pedido debe contener entre 1 y 100 productos');
  }
  if (productos.some((item) => !item || typeof item.productoId !== 'string')) {
    throw new ApiError(400, 'Todos los productos deben tener un productoId válido');
  }
  if (new Set(productos.map((item) => item.productoId)).size !== productos.length) {
    throw new ApiError(400, 'No se permiten productos repetidos en el pedido');
  }
};
const subtotalSeguro = (precio, cantidad) => Math.round(numero(precio * cantidad, 'subtotal') * 100) / 100;

export const normalizarProductosPedido = (productos, productosDB) => {
  validarItems(productos);
  const productosMap = new Map(
    productosDB.map((producto) => [producto._id.toString(), producto])
  );

  return productos.map((item, index) => {
    const producto = productosMap.get(item.productoId.toString());

    if (!producto) {
      throw new ApiError(404, 'Producto no encontrado', {
        field: `productos[${index}].productoId`,
        productoId: item.productoId
      });
    }

    if (!producto.disponible) {
      throw new ApiError(409, 'Producto no disponible', {
        field: `productos[${index}].productoId`,
        productoId: item.productoId
      });
    }

    const cantidad = numero(item.cantidad, `productos[${index}].cantidad`, { min: 1, max: 1000000, entero: true });

    const precioUnitario = Number(producto.precio);
    if (!Number.isFinite(precioUnitario) || precioUnitario < 0) {
      throw new ApiError(500, 'El precio del producto es inválido', {
        productoId: producto._id
      });
    }

    const subtotal = subtotalSeguro(precioUnitario, cantidad);

    return {
      productoId: producto._id,
      nombreSnapshot: producto.nombre,
      categoriaSnapshot: producto.categoria,
      cantidad,
      precioUnitario,
      subtotal
    };
  });
};

export const calcularTotalPedido = (productos) =>
  Math.round(numero(productos.reduce((sum, item) => sum + item.subtotal, 0), 'total') * 100) / 100;


export const normalizarProductosEdicionPedido = (productos, pedido, productosDB) => {
  validarItems(productos);
  const productosExistentes = new Map(
    pedido.productos.map((item) => [item.productoId?.toString(), item])
  );
  const productosMap = new Map(
    productosDB.map((producto) => [producto._id.toString(), producto])
  );
  const ids = new Set();

  return productos.map((item, index) => {
    if (!item?.productoId) {
      throw new ApiError(400, 'Todos los productos deben tener un productoId válido', {
        field: `productos[${index}].productoId`
      });
    }

    const productoId = item.productoId.toString();
    if (ids.has(productoId)) {
      throw new ApiError(400, 'No se permiten productos repetidos en el pedido', {
        field: `productos[${index}].productoId`
      });
    }
    ids.add(productoId);

    const cantidad = numero(item.cantidad, `productos[${index}].cantidad`, { min: 1, max: 1000000, entero: true });

    const existente = productosExistentes.get(productoId);
    if (existente) {
      const productoActual = productosMap.get(productoId);
      return {
        productoId: existente.productoId,
        nombreSnapshot: existente.nombreSnapshot,
        categoriaSnapshot: existente.categoriaSnapshot ?? productoActual?.categoria ?? null,
        cantidad,
        precioUnitario: existente.precioUnitario,
        subtotal: subtotalSeguro(existente.precioUnitario, cantidad)
      };
    }

    const producto = productosMap.get(productoId);
    if (!producto) {
      throw new ApiError(404, 'Producto no encontrado', {
        field: `productos[${index}].productoId`,
        productoId: item.productoId
      });
    }

    if (!producto.disponible) {
      throw new ApiError(409, 'Producto no disponible', {
        field: `productos[${index}].productoId`,
        productoId: item.productoId
      });
    }

    const precioUnitario = Number(producto.precio);
    if (!Number.isFinite(precioUnitario) || precioUnitario < 0) {
      throw new ApiError(500, 'El precio del producto es inválido', {
        productoId: producto._id
      });
    }

    return {
      productoId: producto._id,
      nombreSnapshot: producto.nombre,
      categoriaSnapshot: producto.categoria,
      cantidad,
      precioUnitario,
      subtotal: subtotalSeguro(precioUnitario, cantidad)
    };
  });
};


