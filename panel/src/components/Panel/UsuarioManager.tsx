import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Alert, Box, Button, MenuItem, Paper, Snackbar, TextField, Typography } from "@mui/material";
import { getSession } from "../../auth/session";
import { PERMISSIONS, hasPermission, ROLES, ETIQUETAS_ROL, type Rol } from "../../types/auth";

interface Usuario {
  _id: string;
  nombre: string;
  nombreUsuario: string;
  email: string;
  rol: Rol;
  activo: boolean;
  fechaCreacion: string;
}

interface Formulario {
  nombre: string;
  nombreUsuario: string;
  email: string;
  password: string;
  rol: Rol;
}

const inicial: Formulario = {
  nombre: "",
  nombreUsuario: "",
  email: "",
  password: "",
  rol: ROLES.CAJERO,
};

const apiUrl = import.meta.env.VITE_API_URL;

export default function UsuarioManager() {
  const session = getSession();
  const canManageUsers = session ? hasPermission(session.rol, PERMISSIONS.USERS_MANAGE) : false;
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [form, setForm] = useState<Formulario>(inicial);
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [passwordUsuario, setPasswordUsuario] = useState<Usuario | null>(null);
  const [password, setPassword] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  const request = useCallback(async (path: string, options: RequestInit = {}) => {
    const response = await fetch(`${apiUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.token ?? ""}`,
        ...(options.headers ?? {}),
      },
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error?.message || "No se pudo completar la operación");
    return data;
  }, [session?.token]);

  const cargarUsuarios = useCallback(async () => {
    try {
      setCargando(true);
      const data = await request("/api/usuarios");
      setUsuarios(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error cargando usuarios");
    } finally {
      setCargando(false);
    }
  }, [request]);

  useEffect(() => {
    if (canManageUsers) void cargarUsuarios();
  }, [canManageUsers, cargarUsuarios]);

  const guardar = async (event: FormEvent) => {
    event.preventDefault();
    try {
      if (editando) {
        const data = await request(`/api/usuarios/${editando._id}`, {
          method: "PATCH",
          body: JSON.stringify({
            nombre: form.nombre,
            nombreUsuario: form.nombreUsuario,
            email: form.email,
            rol: form.rol,
          }),
        });
        setUsuarios((prev) => prev.map((item) => item._id === data._id ? data : item));
        setMensaje("Usuario actualizado");
      } else {
        const data = await request("/api/usuarios", {
          method: "POST",
          body: JSON.stringify(form),
        });
        setUsuarios((prev) => [data, ...prev]);
        setMensaje("Usuario creado");
      }
      setForm(inicial);
      setEditando(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el usuario");
    }
  };

  const editar = (usuario: Usuario) => {
    setEditando(usuario);
    setForm({
      nombre: usuario.nombre,
      nombreUsuario: usuario.nombreUsuario,
      email: usuario.email,
      password: "",
      rol: usuario.rol,
    });
  };

  const cambiarEstado = async (usuario: Usuario) => {
    try {
      const data = await request(`/api/usuarios/${usuario._id}/estado`, {
        method: "PATCH",
        body: JSON.stringify({ activo: !usuario.activo }),
      });
      setUsuarios((prev) => prev.map((item) => item._id === data._id ? data : item));
      setMensaje(data.activo ? "Usuario activado" : "Usuario desactivado");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar el estado");
    }
  };

  const cambiarPassword = async () => {
    if (!passwordUsuario) return;
    try {
      await request(`/api/usuarios/${passwordUsuario._id}/password`, {
        method: "PATCH",
        body: JSON.stringify({ password }),
      });
      setPassword("");
      setPasswordUsuario(null);
      setMensaje("Contraseña actualizada");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar la contraseña");
    }
  };

  if (!canManageUsers) {
    return <Alert severity="error">No tiene permisos para administrar usuarios.</Alert>;
  }

  return (
    <Box className="usuarios-page">
      <Typography variant="h4" sx={{ mb: 2 }}>USUARIOS Y ROLES</Typography>

      <Paper component="form" onSubmit={guardar} sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>{editando ? "Editar usuario" : "Nuevo usuario"}</Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 2 }}>
          <TextField label="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
          <TextField label="Usuario" value={form.nombreUsuario} onChange={(e) => setForm({ ...form, nombreUsuario: e.target.value })} required />
          <TextField label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          {!editando && <TextField label="Contraseña" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />}
          <TextField select label="Rol" value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value as Rol })}>
            {Object.values(ROLES).map((rol) => <MenuItem key={rol} value={rol}>{ETIQUETAS_ROL[rol]}</MenuItem>)}
          </TextField>
        </Box>
        <Box sx={{ mt: 2, display: "flex", gap: 1 }}>
          <Button type="submit" variant="contained">{editando ? "Guardar cambios" : "Crear usuario"}</Button>
          {editando && <Button type="button" onClick={() => { setEditando(null); setForm(inicial); }}>Cancelar</Button>}
        </Box>
      </Paper>

      <Paper sx={{ overflow: "auto" }}>
        <Box component="table" sx={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th>Nombre</th><th>Usuario</th><th>Email</th><th>Rol</th><th>Estado</th><th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((usuario) => (
              <tr key={usuario._id}>
                <td>{usuario.nombre}</td>
                <td>{usuario.nombreUsuario}</td>
                <td>{usuario.email}</td>
                <td>{ETIQUETAS_ROL[usuario.rol]}</td>
                <td>{usuario.activo ? "Activo" : "Inactivo"}</td>
                <td>
                  <Button size="small" onClick={() => editar(usuario)}>Editar</Button>{" "}
                  <Button size="small" onClick={() => void cambiarEstado(usuario)} disabled={usuario._id === session?.user.id}>
                    {usuario.activo ? "Desactivar" : "Activar"}
                  </Button>{" "}
                  <Button size="small" onClick={() => { setPasswordUsuario(usuario); setPassword(""); }}>
                    Contraseña
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Box>
        {cargando && <Typography sx={{ p: 2 }}>Cargando usuarios...</Typography>}
      </Paper>

      {passwordUsuario && (
        <Paper sx={{ p: 2, mt: 2 }}>
          <Typography variant="h6">Cambiar contraseña: {passwordUsuario.nombreUsuario}</Typography>
          <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
            <TextField size="small" type="password" label="Nueva contraseña" value={password} onChange={(e) => setPassword(e.target.value)} />
            <Button variant="contained" onClick={() => void cambiarPassword()}>Guardar</Button>
            <Button onClick={() => setPasswordUsuario(null)}>Cancelar</Button>
          </Box>
        </Paper>
      )}

      <Snackbar open={Boolean(mensaje)} autoHideDuration={3000} onClose={() => setMensaje("")}>
        <Alert severity="success">{mensaje}</Alert>
      </Snackbar>
      <Snackbar open={Boolean(error)} autoHideDuration={5000} onClose={() => setError("")}>
        <Alert severity="error">{error}</Alert>
      </Snackbar>
    </Box>
  );
}

