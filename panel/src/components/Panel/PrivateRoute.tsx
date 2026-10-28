import React from "react";
import { Navigate } from "react-router-dom";
import { clearSession, getSession } from "../../auth/session";
import { isValidRol } from "../../types/auth";

interface Props {
  children: React.ReactNode;
}

interface JwtPayload {
  rol?: unknown;
  exp?: number;
}

const decodeJwtPayload = (token: string): JwtPayload | null => {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;

    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(normalized);
    return JSON.parse(decoded) as JwtPayload;
  } catch {
    return null;
  }
};

export const PrivateRoute = ({ children }: Props) => {
  const session = getSession();

  if (!session) {
    clearSession();
    return <Navigate to="/login" replace />;
  }

  const payload = decodeJwtPayload(session.token);
  const exp = payload?.exp;
  const isExpired = typeof exp === "number" && exp * 1000 <= Date.now();
  const tokenRoleIsValid = isValidRol(payload?.rol);
  const sessionRoleMatchesToken = tokenRoleIsValid && payload?.rol === session.rol;

  if (!payload || isExpired || !sessionRoleMatchesToken) {
    clearSession();
    return <Navigate to="/login" replace />;
  }

  return children;
};

