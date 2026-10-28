// src/components/AuthLogin.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./auth.css";
import logo from "../../assets/burger.svg";
import Snackbar from "@mui/material/Snackbar";
import MuiAlert from "@mui/material/Alert";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import type { AlertColor } from "@mui/material/Alert";
import PersonIcon from "@mui/icons-material/Person";
import LockIcon from "@mui/icons-material/Lock";
import { isValidRol } from "../../types/auth";
import { saveSession } from "../../auth/session";
import type { TipoPedido } from "../../types/pedido";

const Alert = MuiAlert as typeof MuiAlert;

interface LoginResponse {
  token?: string;
  rol?: unknown;
  nombre?: string;
  id?: string;
  orderTypes?: TipoPedido[];
  error?: { message?: string };
}

export const AuthLogin = () => {
  const [nombreUsuario, setNombreUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMsg, setSnackbarMsg] = useState("");
  const [snackbarType, setSnackbarType] = useState<AlertColor>("success");
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombreUsuario || !password) {
      setSnackbarType("warning"); setSnackbarMsg("Completá ambos campos."); setSnackbarOpen(true); return;
    }
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombreUsuario, password }),
      });
      const data = (await response.json()) as LoginResponse;
      if (!response.ok) {
        setSnackbarType("error"); setSnackbarMsg(data.error?.message || "Error al iniciar sesión."); setSnackbarOpen(true); return;
      }
      if (!data.token || !isValidRol(data.rol) || !data.id || typeof data.nombre !== "string") {
        setSnackbarType("error"); setSnackbarMsg("Respuesta de autenticación inválida."); setSnackbarOpen(true); return;
      }
      saveSession({
        orderTypes: data.orderTypes, token: data.token, rol: data.rol, user: { nombre: data.nombre, id: data.id } });
      setSnackbarType("success"); setSnackbarMsg("Inicio de sesión exitoso."); setSnackbarOpen(true);
      const destino = data.rol === "DELIVERY" ? "/panel/delivery" : data.rol === "CHEF" ? "/panel/cocina" : "/panel/dashboard";
      setTimeout(() => navigate(destino), 1000);
    } catch (err) {
      console.error(err); setSnackbarType("error"); setSnackbarMsg("Error al conectar con el servidor."); setSnackbarOpen(true);
    }
  };

  return (
    <div className="auth-container">
      <img src={logo} alt="Logo" className="auth-logo" />
      <h2 className="h2title">Panel de Administración</h2>
      <form className="auth-form" onSubmit={handleLogin}>
        <TextField label="Nombre de usuario" value={nombreUsuario} onChange={(e) => setNombreUsuario(e.target.value)} fullWidth required margin="normal" InputProps={{ startAdornment: <InputAdornment position="start"><PersonIcon /></InputAdornment> }} />
        <TextField label="Contraseña" type="password" value={password} onChange={(e) => setPassword(e.target.value)} fullWidth required margin="normal" InputProps={{ startAdornment: <InputAdornment position="start"><LockIcon /></InputAdornment> }} />
        <button type="submit" className="login-button">Iniciar sesión</button>
      </form>
      <p className="auth-link">¿Es la primera instalación? <a href="/register">Configurar administrador inicial</a></p>
      <Snackbar open={snackbarOpen} autoHideDuration={4000} onClose={() => setSnackbarOpen(false)} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        <Alert severity={snackbarType} onClose={() => setSnackbarOpen(false)} sx={{ width: "100%" }}>{snackbarMsg}</Alert>
      </Snackbar>
    </div>
  );
};


