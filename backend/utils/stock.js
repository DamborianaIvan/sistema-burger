export const redondearCantidadStock = (valor) =>
  Math.round((Number(valor) + Number.EPSILON) * 1_000_000) / 1_000_000;

export const calcularConsumosPedido = (productosPedido, recetas) => {
  const recetaPorProducto = new Map(
    recetas
      .filter((receta) => receta.activa !== false)
      .map((receta) => [String(receta.productoId), receta])
  );
  const consumos = new Map();

  for (const item of productosPedido) {
    if (!item.productoId) continue;

    const receta = recetaPorProducto.get(String(item.productoId));
    if (!receta) continue;

    for (const componente of receta.componentes ?? []) {
      const ingredienteId = String(componente.ingredienteId);
      const consumo = redondearCantidadStock(
        Number(componente.cantidad) * Number(item.cantidad)
      );

      consumos.set(
        ingredienteId,
        redondearCantidadStock((consumos.get(ingredienteId) ?? 0) + consumo)
      );
    }
  }

  return Array.from(consumos, ([ingredienteId, cantidad]) => ({
    ingredienteId,
    cantidad
  }));
};

