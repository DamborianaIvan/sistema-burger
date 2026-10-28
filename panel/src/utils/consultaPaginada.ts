export const consultaPaginada = async <T>(ruta: string, token?: string, signal?: AbortSignal) => {
  const respuesta = await fetch(`${import.meta.env.VITE_API_URL}${ruta}`, {
    headers: { Authorization: `Bearer ${token}` }, signal,
  });
  const datos = await respuesta.json();
  if (!respuesta.ok) throw new Error(datos?.error?.message ?? "No se pudieron cargar los datos");
  return { datos: datos as T, total: Number(respuesta.headers.get("X-Total-Count") ?? 0) };
};

