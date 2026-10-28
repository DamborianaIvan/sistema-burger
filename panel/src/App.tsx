import { BrowserRouter as Router, Navigate, Routes, Route } from "react-router-dom";
import { AuthLogin } from "./components/Login/AuthLogin";
import { AuthRegister } from "./components/Login/AuthRegister";
import PanelLayout from "./components/Panel/PanelLayout";
import { Dashboard } from "./components/Panel/Dashboard";
import { ListaPedidos } from "./components/Panel/ListaPedidos";
import Mesas from "./components/Panel/Mesas";
import NuevoPedido from "./components/Panel/NuevoPedido";
import { PrivateRoute } from "./components/Panel/PrivateRoute";
import Reportes from "./components/Panel/Reportes";
import ProductoManager from "./components/Panel/ProductoManager";
import UsuarioManager from "./components/Panel/UsuarioManager";
import Cocina from "./components/Panel/Cocina";
import Caja from "./components/Panel/Caja";
import StockManager from "./components/Panel/StockManager";
import Auditoria from "./components/Panel/Auditoria";
import DeliveryPedidos from "./components/Panel/DeliveryPedidos";
import { RoleRoute } from "./components/Panel/RoleRoute";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<AuthLogin />} />
        <Route path="/register" element={<AuthRegister />} />

        <Route
          path="/panel"
          element={
            <PrivateRoute>
              <PanelLayout />
            </PrivateRoute>
          }
        >
          <Route
            index
            element={
              <RoleRoute>
                <Navigate to="/panel/dashboard" replace />
              </RoleRoute>
            }
          />
          <Route path="mesas" element={<RoleRoute salonOnly><Mesas /></RoleRoute>} />
          <Route path="nuevo-pedido" element={<RoleRoute><NuevoPedido /></RoleRoute>} />
          <Route path="dashboard" element={<RoleRoute><Dashboard /></RoleRoute>} />
          <Route path="pedidos" element={<RoleRoute><ListaPedidos /></RoleRoute>} />
          <Route path="cocina" element={<RoleRoute kitchen><Cocina /></RoleRoute>} />
          <Route path="caja" element={<RoleRoute><Caja /></RoleRoute>} />
          <Route path="stock" element={<RoleRoute><StockManager /></RoleRoute>} />
          <Route path="reportes" element={<RoleRoute><Reportes /></RoleRoute>} />
          <Route path="crear-producto" element={<RoleRoute><ProductoManager /></RoleRoute>} />
          <Route path="usuarios" element={<RoleRoute><UsuarioManager /></RoleRoute>} />
          <Route path="auditoria" element={<RoleRoute><Auditoria /></RoleRoute>} />
          <Route path="delivery" element={<RoleRoute deliveryOnly><DeliveryPedidos /></RoleRoute>} />
          <Route
            path="*"
            element={
              <RoleRoute>
                <Navigate to="/panel/dashboard" replace />
              </RoleRoute>
            }
          />
        </Route>

        <Route path="*" element={<AuthLogin />} />
      </Routes>
    </Router>
  );
}



