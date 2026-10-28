import { isValidRol, type Rol } from "../types/auth";
import { TIPOS_PEDIDO, type TipoPedido } from "../types/pedido";

export interface SessionUser {
  id: string;
  nombre: string;
}

export interface Session {
  token: string;
  rol: Rol;
  user: SessionUser;
  orderTypes?: TipoPedido[];
}

const TOKEN_KEY = "token";
const ROLE_KEY = "rol";
const USER_KEY = "user";
const ORDER_TYPES_KEY = "orderTypes";

export const getSession = (): Session | null => {
  const token = localStorage.getItem(TOKEN_KEY);
  const rolValue = localStorage.getItem(ROLE_KEY);
  const userValue = localStorage.getItem(USER_KEY);

  if (!token || !isValidRol(rolValue) || !userValue) return null;

  try {
    const user = JSON.parse(userValue) as Partial<SessionUser>;

    if (typeof user.id !== "string" || typeof user.nombre !== "string") {
      return null;
    }

    const rawTypes: unknown = JSON.parse(localStorage.getItem(ORDER_TYPES_KEY) ?? 'null');
    const orderTypes = Array.isArray(rawTypes)
      ? TIPOS_PEDIDO.filter(tipo => rawTypes.includes(tipo))
      : [];
    return { token, rol: rolValue, user: { id: user.id, nombre: user.nombre },
      orderTypes: orderTypes.length ? orderTypes : ['DELIVERY', 'TAKEAWAY'] };
  } catch {
    return null;
  }
};

export const saveSession = (session: Session): void => {
  localStorage.setItem(TOKEN_KEY, session.token);
  localStorage.setItem(ROLE_KEY, session.rol);
  localStorage.setItem(USER_KEY, JSON.stringify(session.user));
  localStorage.setItem(ORDER_TYPES_KEY, JSON.stringify(session.orderTypes ?? ['DELIVERY', 'TAKEAWAY']));
};

export const clearSession = (): void => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ROLE_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(ORDER_TYPES_KEY);
};

export const logoutSession = async (): Promise<void> => {
  const session = getSession();
  if (session) {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok && response.status !== 401) {
      throw new Error('No se pudo cerrar la sesión. Intentá nuevamente.');
    }
  }
  clearSession();
};


