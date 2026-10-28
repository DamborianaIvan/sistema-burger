import CategoriaProducto from '../models/CategoriaProducto.js';
import { CATEGORIAS_PRODUCTO_BASE } from '../constants/categoriasProducto.js';
import { normalizarNombreCategoriaProducto } from '../utils/categoriaProducto.js';

export const asegurarCategoriasProductoBase = async () => {
  await CategoriaProducto.bulkWrite(
    CATEGORIAS_PRODUCTO_BASE.map((nombre) => ({
      updateOne: {
        filter: { nombre },
        update: {
          $setOnInsert: {
            nombre,
            esPredeterminada: true
          }
        },
        upsert: true
      }
    })),
    { ordered: false }
  );
};

export const categoriaProductoExiste = async (nombre) => {
  const normalizado = normalizarNombreCategoriaProducto(nombre);

  if (CATEGORIAS_PRODUCTO_BASE.includes(normalizado)) {
    return true;
  }

  return Boolean(await CategoriaProducto.exists({ nombre: normalizado }));
};

