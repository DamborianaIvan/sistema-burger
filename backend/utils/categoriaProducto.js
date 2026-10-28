export const normalizarNombreCategoriaProducto = (nombre) =>
  String(nombre ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();

export const esNombreCategoriaProductoValido = (nombre) => {
  const normalizado = normalizarNombreCategoriaProducto(nombre);
  return normalizado.length >= 2 && normalizado.length <= 40;
};

