import type { ProductoPedido } from "../../types/pedido";
import "./PedidoCard.css";

export const ProductosPedido = ({ productos }: { productos: ProductoPedido[] }) => (
  <ul className="pedido-lectura-productos" aria-label="Productos del pedido">
    {productos.map((producto, index) => (
      <li key={`${producto.productoId ?? "producto"}-${index}`} className="pedido-lectura-producto">
        <span className="pedido-lectura-producto-cantidad">{producto.cantidad} ×</span>
        <div className="pedido-lectura-producto-detalle">
          <span className="pedido-lectura-producto-nombre">{producto.nombreSnapshot}</span>
          <span className="pedido-lectura-producto-categoria">
            {producto.categoriaSnapshot?.trim() || "Sin categoría"}
          </span>
        </div>
      </li>
    ))}
  </ul>
);

