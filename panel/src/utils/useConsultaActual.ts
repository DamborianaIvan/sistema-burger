import { useCallback, useEffect, useRef } from "react";

// Evita que una respuesta lenta reemplace los datos de una página más reciente.
export const useConsultaActual = () => {
  const secuencia = useRef(0);
  useEffect(() => () => { secuencia.current++; }, []);
  return useCallback(() => {
    const id = ++secuencia.current;
    return () => secuencia.current === id;
  }, []);
};

