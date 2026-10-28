import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { getSession } from "../../auth/session";

interface RoleRouteProps {
  children: ReactNode;
  deliveryOnly?: boolean;
  kitchen?: boolean;
  salonOnly?: boolean;
  prepizzasOnly?: boolean;
}

export const RoleRoute = ({ children, deliveryOnly = false, kitchen = false, salonOnly = false, prepizzasOnly = false }: RoleRouteProps) => {
  const session = getSession();
  const isChef = session?.rol === "CHEF";
  if (isChef && !kitchen) return <Navigate to="/panel/cocina" replace />;
  const isDelivery = session?.rol === "DELIVERY";

  if (deliveryOnly && !isDelivery) {
    return <Navigate to="/panel/dashboard" replace />;
  }

  if (!deliveryOnly && isDelivery) {
    return <Navigate to="/panel/delivery" replace />;
  }

  if (salonOnly && !session?.orderTypes?.includes("SALON")) {
    return <Navigate to="/panel/nuevo-pedido" replace />;
  }

  if (prepizzasOnly && !session?.features?.prepizzas) {
    return <Navigate to="/panel/dashboard" replace />;
  }

  return children;
};


