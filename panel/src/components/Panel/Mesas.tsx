import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import PeopleAltOutlinedIcon from "@mui/icons-material/PeopleAltOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import TableRestaurantIcon from "@mui/icons-material/TableRestaurant";
import EditLocationAltOutlinedIcon from "@mui/icons-material/EditLocationAltOutlined";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import RotateRightOutlinedIcon from "@mui/icons-material/RotateRightOutlined";
import OpenWithOutlinedIcon from "@mui/icons-material/OpenWithOutlined";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import { getSession } from "../../auth/session";
import type { Pedido } from "../../types/pedido";
import "./Mesas.css";

const API_URL = import.meta.env.VITE_API_URL;
const PLANO_ANCHO = 1200;
const PLANO_ALTO = 700;
const ANCHO_MIN = 80;
const ANCHO_MAX = 280;
const ALTO_MIN = 80;
const ALTO_MAX = 220;
const ESTADOS_FINALIZADOS = new Set(["ENTREGADO", "CANCELADO"]);

type FormaMesa = "RECTANGULAR" | "CUADRADA" | "REDONDA";

interface LayoutMesa {
  x: number;
  y: number;
  ancho: number;
  alto: number;
  rotacion: number;
  forma: FormaMesa;
}

interface Mesa {
  _id: string;
  numero: number;
  nombre?: string | null;
  capacidad?: number;
  estado: "LIBRE" | "OCUPADA";
  activa?: boolean;
  observaciones?: string;
  layout?: Partial<LayoutMesa>;
}

type MesaPedido = Pedido["mesaId"] | { _id: string } | null;

const obtenerIdMesa = (mesaId: MesaPedido) =>
  typeof mesaId === "string" ? mesaId : mesaId && "_id" in mesaId ? mesaId._id : undefined;

const formatoPesos = (monto: number) =>
  monto.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
  });

const limitar = (valor: number, min: number, max: number) =>
  Math.min(max, Math.max(min, valor));

const layoutBase = (mesa: Mesa, index: number): LayoutMesa => {
  const columnas = 5;
  const ancho = mesa.layout?.ancho ?? 140;
  const alto = mesa.layout?.alto ?? 110;
  const xAutomatico = 40 + (index % columnas) * 220;
  const yAutomatico = 45 + Math.floor(index / columnas) * 170;
  const tienePosicion =
    typeof mesa.layout?.x === "number" &&
    Number.isFinite(mesa.layout.x) &&
    typeof mesa.layout?.y === "number" &&
    Number.isFinite(mesa.layout.y) &&
    !(mesa.layout.x === 0 && mesa.layout.y === 0 && index > 0);

  return {
    x: tienePosicion ? Number(mesa.layout?.x) : limitar(xAutomatico, 0, PLANO_ANCHO - ancho),
    y: tienePosicion ? Number(mesa.layout?.y) : limitar(yAutomatico, 0, PLANO_ALTO - alto),
    ancho,
    alto,
    rotacion: Number(mesa.layout?.rotacion ?? 0),
    forma: (mesa.layout?.forma as FormaMesa) ?? "RECTANGULAR",
  };
};

const Mesas = () => {
  const session = getSession();
  const puedeGestionarMesas = session?.rol === "ADMIN" || session?.rol === "CAJERO";
  const puedeEditarPlano = session?.rol === "ADMIN";
  const planoRef = useRef<HTMLDivElement | null>(null);

  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [mesaSeleccionada, setMesaSeleccionada] = useState<Mesa | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [cerrandoPedidoId, setCerrandoPedidoId] = useState<string | null>(null);
  const [editandoPlano, setEditandoPlano] = useState(false);
  const [guardandoPlano, setGuardandoPlano] = useState(false);
  const [layoutDraft, setLayoutDraft] = useState<Record<string, LayoutMesa>>({});
  const [mesaEditadaId, setMesaEditadaId] = useState<string | null>(null);
  const [arrastre, setArrastre] = useState<{
    mesaId: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [nuevaMesaAbierta, setNuevaMesaAbierta] = useState(false);
  const [creandoMesa, setCreandoMesa] = useState(false);
  const [nuevaMesa, setNuevaMesa] = useState({
    numero: "",
    nombre: "",
    capacidad: "4",
    observaciones: "",
  });

  const cargarDatos = useCallback(async () => {
    const token = getSession()?.token;
    const headers = { Authorization: `Bearer ${token}` };

    try {
      setError(null);
      const [mesasResponse, pedidosResponse] = await Promise.all([
        fetch(`${API_URL}/api/mesas`, { headers }),
        fetch(`${API_URL}/api/pedidos?activos=true&tipoPedido=SALON&limit=200`, { headers }),
      ]);

      if (pedidosResponse.headers.get("X-Has-More") === "true") throw new Error("Hay más de 200 mesas activas. Revisá los pedidos antes de operar el plano.");
      if (!mesasResponse.ok || !pedidosResponse.ok) {
        throw new Error("No se pudieron cargar las mesas.");
      }

      const [mesasData, pedidosData] = await Promise.all([
        mesasResponse.json(),
        pedidosResponse.json(),
      ]);

      setMesas(Array.isArray(mesasData) ? mesasData : []);
      setPedidos(Array.isArray(pedidosData) ? pedidosData : []);
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudieron cargar las mesas. Intentá actualizar nuevamente.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargarDatos();
    const intervalo = window.setInterval(() => {
      if (!editandoPlano) void cargarDatos();
    }, 30_000);
    return () => window.clearInterval(intervalo);
  }, [cargarDatos, editandoPlano]);

  const layoutsVisuales = useMemo(() => {
    const resultado: Record<string, LayoutMesa> = {};
    mesas.forEach((mesa, index) => {
      resultado[mesa._id] = layoutBase(mesa, index);
    });
    return resultado;
  }, [mesas]);

  const layoutsActivos = editandoPlano ? layoutDraft : layoutsVisuales;

  const pedidosActivosPorMesa = useMemo(() => {
    const pedidosPorMesa = new Map<string, Pedido>();

    pedidos
      .filter(
        (pedido) =>
          pedido.tipoPedido === "SALON" &&
          !pedido.cierre?.cerrado &&
          !ESTADOS_FINALIZADOS.has(pedido.estadoPedido) &&
          obtenerIdMesa(pedido.mesaId),
      )
      .sort(
        (a, b) =>
          new Date(b.fechaPedido).getTime() - new Date(a.fechaPedido).getTime(),
      )
      .forEach((pedido) => {
        const mesaId = obtenerIdMesa(pedido.mesaId);
        if (mesaId && !pedidosPorMesa.has(mesaId)) pedidosPorMesa.set(mesaId, pedido);
      });

    return pedidosPorMesa;
  }, [pedidos]);

  const resumen = useMemo(
    () => ({
      libres: mesas.filter((mesa) => mesa.estado === "LIBRE").length,
      ocupadas: mesas.filter((mesa) => mesa.estado === "OCUPADA").length,
    }),
    [mesas],
  );

  const pedidoSeleccionado = mesaSeleccionada
    ? pedidosActivosPorMesa.get(mesaSeleccionada._id)
    : undefined;

  const comenzarEdicion = () => {
    setLayoutDraft(layoutsVisuales);
    setMesaSeleccionada(null);
    setMesaEditadaId(mesas[0]?._id ?? null);
    setMensaje(null);
    setError(null);
    setEditandoPlano(true);
  };

  const abrirNuevaMesa = () => {
    const siguienteNumero = mesas.reduce((max, mesa) => Math.max(max, mesa.numero), 0) + 1;
    setNuevaMesa({
      numero: String(siguienteNumero),
      nombre: "",
      capacidad: "4",
      observaciones: "",
    });
    setError(null);
    setNuevaMesaAbierta(true);
  };

  const eliminarMesa = async (mesa: Mesa) => {
    const token = session?.token;
    if (!token || !puedeEditarPlano) return;

    if (mesa.estado === "OCUPADA" || pedidosActivosPorMesa.has(mesa._id)) {
      setError("No se puede eliminar una mesa ocupada o con un pedido activo.");
      return;
    }

    const confirmar = window.confirm(
      `¿Eliminar la mesa ${mesa.numero}? Si tiene pedidos históricos, se retirará del salón conservando ese historial.`,
    );
    if (!confirmar) return;

    try {
      setError(null);
      setMensaje(null);

      const response = await fetch(`${API_URL}/api/mesas/${mesa._id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const body = await response.json();
      if (!response.ok) {
        throw new Error(body?.error?.message ?? body?.message ?? "No se pudo eliminar la mesa.");
      }

      setMesas((actuales) => actuales.filter((item) => item._id !== mesa._id));
      setLayoutDraft((actual) => {
        const siguiente = { ...actual };
        delete siguiente[mesa._id];
        return siguiente;
      });
      setMesaEditadaId(null);
      setMensaje(body?.message ?? `Mesa ${mesa.numero} eliminada correctamente.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo eliminar la mesa.");
      await cargarDatos();
    }
  };

  const crearNuevaMesa = async () => {
    const token = session?.token;
    if (!token || !puedeEditarPlano) return;

    const numero = Number(nuevaMesa.numero);
    const capacidad = Number(nuevaMesa.capacidad);

    if (!Number.isInteger(numero) || numero <= 0) {
      setError("El número de mesa debe ser un entero mayor a cero.");
      return;
    }

    if (!Number.isInteger(capacidad) || capacidad <= 0) {
      setError("La capacidad debe ser un entero mayor a cero.");
      return;
    }

    try {
      setCreandoMesa(true);
      setError(null);
      setMensaje(null);

      const response = await fetch(`${API_URL}/api/mesas`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          numero,
          nombre: nuevaMesa.nombre,
          capacidad,
          observaciones: nuevaMesa.observaciones,
        }),
      });

      const body = await response.json();
      if (!response.ok) {
        throw new Error(body?.error?.message ?? body?.message ?? "No se pudo crear la mesa.");
      }

      const mesaCreada = body as Mesa;
      const layoutInicial = layoutBase(mesaCreada, mesas.length);

      setMesas((actuales) => [...actuales, mesaCreada].sort((a, b) => a.numero - b.numero));
      setLayoutDraft((actual) => ({
        ...actual,
        [mesaCreada._id]: layoutInicial,
      }));
      setMesaEditadaId(mesaCreada._id);
      setNuevaMesaAbierta(false);
      setMensaje(`Mesa ${mesaCreada.numero} creada. Ubicala en el plano y guardá los cambios.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo crear la mesa.");
    } finally {
      setCreandoMesa(false);
    }
  };

  const cancelarEdicion = () => {
    setLayoutDraft({});
    setMesaEditadaId(null);
    setArrastre(null);
    setEditandoPlano(false);
  };

  const guardarPlano = async () => {
    const token = session?.token;
    if (!token || !puedeEditarPlano) return;

    try {
      setGuardandoPlano(true);
      setError(null);
      setMensaje(null);

      const response = await fetch(`${API_URL}/api/mesas/layout`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mesas: mesas.map((mesa) => ({
            id: mesa._id,
            layout: layoutDraft[mesa._id] ?? layoutsVisuales[mesa._id],
          })),
        }),
      });

      const body = await response.json();
      if (!response.ok) {
        throw new Error(body?.error?.message ?? body?.message ?? "No se pudo guardar el plano.");
      }

      setMesas(Array.isArray(body.mesas) ? body.mesas : mesas);
      setMensaje("Plano guardado correctamente.");
      setEditandoPlano(false);
      setMesaEditadaId(null);
      setLayoutDraft({});
      await cargarDatos();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo guardar el plano.");
    } finally {
      setGuardandoPlano(false);
    }
  };

  const actualizarLayout = (mesaId: string, cambios: Partial<LayoutMesa>) => {
    setLayoutDraft((actual) => {
      const previo = actual[mesaId] ?? layoutsVisuales[mesaId];
      if (!previo) return actual;

      const siguiente = { ...previo, ...cambios };
      siguiente.ancho = limitar(siguiente.ancho, ANCHO_MIN, ANCHO_MAX);
      siguiente.alto = limitar(siguiente.alto, ALTO_MIN, ALTO_MAX);
      siguiente.x = limitar(siguiente.x, 0, PLANO_ANCHO - siguiente.ancho);
      siguiente.y = limitar(siguiente.y, 0, PLANO_ALTO - siguiente.alto);
      siguiente.rotacion = ((siguiente.rotacion % 360) + 360) % 360;

      if (siguiente.forma === "CUADRADA" || siguiente.forma === "REDONDA") {
        const lado = limitar(Math.max(siguiente.ancho, siguiente.alto), ANCHO_MIN, Math.min(ANCHO_MAX, ALTO_MAX));
        siguiente.ancho = lado;
        siguiente.alto = lado;
        siguiente.x = limitar(siguiente.x, 0, PLANO_ANCHO - lado);
        siguiente.y = limitar(siguiente.y, 0, PLANO_ALTO - lado);
      }

      return { ...actual, [mesaId]: siguiente };
    });
  };

  const iniciarArrastre = (event: React.PointerEvent, mesa: Mesa) => {
    if (!editandoPlano || !planoRef.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    const rect = planoRef.current.getBoundingClientRect();
    const escalaX = PLANO_ANCHO / rect.width;
    const escalaY = PLANO_ALTO / rect.height;
    const layout = layoutsActivos[mesa._id];
    if (!layout) return;

    setMesaEditadaId(mesa._id);
    setArrastre({
      mesaId: mesa._id,
      offsetX: (event.clientX - rect.left) * escalaX - layout.x,
      offsetY: (event.clientY - rect.top) * escalaY - layout.y,
    });
  };

  const moverMesa = (event: React.PointerEvent) => {
    if (!arrastre || !planoRef.current) return;

    const rect = planoRef.current.getBoundingClientRect();
    const escalaX = PLANO_ANCHO / rect.width;
    const escalaY = PLANO_ALTO / rect.height;
    const layout = layoutsActivos[arrastre.mesaId];
    if (!layout) return;

    actualizarLayout(arrastre.mesaId, {
      x: limitar((event.clientX - rect.left) * escalaX - arrastre.offsetX, 0, PLANO_ANCHO - layout.ancho),
      y: limitar((event.clientY - rect.top) * escalaY - arrastre.offsetY, 0, PLANO_ALTO - layout.alto),
    });
  };

  const finalizarArrastre = () => setArrastre(null);

  const liberarMesaHuerfana = async (mesa: Mesa) => {
    if (!window.confirm(`La mesa ${mesa.numero} figura ocupada pero no tiene un pedido activo asociado. ¿Querés liberarla?`)) return;

    const token = session?.token;
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

    try {
      setError(null);
      setMensaje(null);
      const response = await fetch(`${API_URL}/api/mesas/${mesa._id}/estado`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ estado: "LIBRE" }),
      });
      if (!response.ok) throw new Error("No se pudo liberar la mesa.");

      setMesaSeleccionada(null);
      setMensaje(`Mesa ${mesa.numero} liberada correctamente.`);
      await cargarDatos();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo liberar la mesa.");
      await cargarDatos();
    }
  };

  const actualizarEstadoPedido = async (
    mesa: Mesa,
    pedido: Pedido,
    estado: "SERVIDO" | "CANCELADO",
  ) => {
    const accion = estado === "SERVIDO" ? "marcado como servido" : "cancelación";
    if (!window.confirm(`¿Confirmás que el pedido quede ${accion} en la mesa ${mesa.numero}?`)) return;

    const token = session?.token;
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

    try {
      setCerrandoPedidoId(pedido._id);
      setError(null);
      setMensaje(null);

      const endpoint = estado === "CANCELADO"
        ? `${API_URL}/api/pedidos/${pedido._id}/cancelar`
        : `${API_URL}/api/pedidos/${pedido._id}/estado`;

      const pedidoResponse = await fetch(endpoint, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ estadoPedido: estado }),
      });

      const pedidoBody = await pedidoResponse.json();
      if (!pedidoResponse.ok) {
        throw new Error(pedidoBody?.error?.message ?? pedidoBody?.message ?? "No se pudo actualizar el pedido.");
      }

      setMesaSeleccionada(null);
      setMensaje(
        estado === "SERVIDO"
          ? `Pedido de mesa ${mesa.numero} marcado como servido.`
          : `Pedido de mesa ${mesa.numero} cancelado correctamente.`,
      );
      await cargarDatos();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo actualizar el pedido.");
      await cargarDatos();
    } finally {
      setCerrandoPedidoId(null);
    }
  };

  const renderAccionesMesa = (mesa: Mesa, pedido?: Pedido, modal = false) => {
    if (!pedido && mesa.estado === "OCUPADA" && puedeGestionarMesas) {
      return (
        <button
          className={`${modal ? "mesa-modal-cancel-action" : "mesa-cancel-action"} mesa-danger-action`}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void liberarMesaHuerfana(mesa);
          }}
        >
          Liberar mesa huérfana
        </button>
      );
    }

    if (!pedido) {
      return modal ? (
        <Link
          to={`/panel/nuevo-pedido?mesaId=${mesa._id}`}
          onClick={() => setMesaSeleccionada(null)}
        >
          Crear pedido
        </Link>
      ) : null;
    }

    return (
      <>
        {pedido.estadoPedido === "LISTO" && (
          <button
            className={modal ? "mesa-modal-action" : "mesa-action"}
            type="button"
            disabled={cerrandoPedidoId === pedido._id}
            onClick={(event) => {
              event.stopPropagation();
              void actualizarEstadoPedido(mesa, pedido, "SERVIDO");
            }}
          >
            {cerrandoPedidoId === pedido._id ? "Actualizando..." : "Marcar como servido"}
          </button>
        )}

        {["EN_COCINA", "LISTO"].includes(pedido.estadoPedido) && (
          <button
            className={`${modal ? "mesa-modal-cancel-action" : "mesa-cancel-action"} mesa-danger-action`}
            type="button"
            disabled={cerrandoPedidoId === pedido._id}
            onClick={(event) => {
              event.stopPropagation();
              void actualizarEstadoPedido(mesa, pedido, "CANCELADO");
            }}
          >
            Cancelar pedido
          </button>
        )}

        {pedido.estadoPedido === "SERVIDO" && !pedido.cierre?.cerrado && (
          <Link
            className={modal ? "mesa-modal-action" : "mesa-action"}
            to="/panel/caja"
            onClick={(event) => {
              event.stopPropagation();
              if (modal) setMesaSeleccionada(null);
            }}
          >
            Ir a caja para cobrar/cerrar
          </Link>
        )}
      </>
    );
  };

  const mesaEditada = mesaEditadaId ? mesas.find((mesa) => mesa._id === mesaEditadaId) : undefined;
  const layoutMesaEditada = mesaEditadaId ? layoutDraft[mesaEditadaId] : undefined;

  return (
    <section className="mesas-page">
      <header className="mesas-header">
        <div>
          <div className="mesas-title">
            <TableRestaurantIcon fontSize="large" />
            <h1>Plano del salón</h1>
          </div>
          <p>
            {editandoPlano
              ? "Arrastrá las mesas y ajustá tamaño, rotación o forma."
              : "Estado operativo del salón y pedidos activos en tiempo real."}
          </p>
        </div>

        <div className="mesas-header-actions">
          {!editandoPlano && (
            <button className="mesas-refresh" type="button" onClick={() => void cargarDatos()}>
              <RefreshIcon fontSize="small" /> Actualizar
            </button>
          )}

          {puedeEditarPlano && !editandoPlano && (
            <button className="mesas-edit-layout" type="button" onClick={comenzarEdicion}>
              <EditLocationAltOutlinedIcon fontSize="small" /> Editar plano
            </button>
          )}

          {editandoPlano && (
            <>
              <button className="mesas-new-table" type="button" onClick={abrirNuevaMesa} disabled={guardandoPlano}>
                <AddOutlinedIcon fontSize="small" /> Nueva mesa
              </button>
              <button className="mesas-cancel-layout" type="button" onClick={cancelarEdicion} disabled={guardandoPlano}>
                <CloseOutlinedIcon fontSize="small" /> Cancelar
              </button>
              <button className="mesas-save-layout" type="button" onClick={() => void guardarPlano()} disabled={guardandoPlano}>
                <SaveOutlinedIcon fontSize="small" /> {guardandoPlano ? "Guardando..." : "Guardar plano"}
              </button>
            </>
          )}
        </div>
      </header>

      <div className="mesas-resumen" aria-label="Resumen de mesas">
        <div className="resumen-chip libre">
          <span className="estado-dot" />
          <strong>{resumen.libres}</strong> libres
        </div>
        <div className="resumen-chip ocupada">
          <span className="estado-dot" />
          <strong>{resumen.ocupadas}</strong> ocupadas
        </div>
        <div className="resumen-chip total">
          <strong>{mesas.length}</strong> mesas en total
        </div>
        {editandoPlano && <div className="resumen-chip editor">Modo edición · solo ADMIN</div>}
      </div>

      {error && <p className="mesas-error">{error}</p>}
      {mensaje && <p className="mesas-success">{mensaje}</p>}

      {cargando ? (
        <p className="mesas-loading">Cargando mesas...</p>
      ) : mesas.length > 0 ? (
        <div className={`salon-workspace ${editandoPlano ? "editing" : ""}`}>
          <div
            ref={planoRef}
            className="salon-plano"
            onPointerMove={moverMesa}
            onPointerUp={finalizarArrastre}
            onPointerCancel={finalizarArrastre}
            onPointerLeave={() => {
              if (arrastre) finalizarArrastre();
            }}
          >
            {mesas.map((mesa) => {
              const pedido = pedidosActivosPorMesa.get(mesa._id);
              const ocupada = mesa.estado === "OCUPADA" || Boolean(pedido);
              const layout = layoutsActivos[mesa._id] ?? layoutBase(mesa, 0);
              const formaClase = layout.forma.toLowerCase();

              return (
                <article
                  key={mesa._id}
                  className={`mesa-plano ${ocupada ? "ocupada" : "libre"} ${formaClase} ${mesaEditadaId === mesa._id ? "seleccionada" : ""}`}
                  style={{
                    left: `${(layout.x / PLANO_ANCHO) * 100}%`,
                    top: `${(layout.y / PLANO_ALTO) * 100}%`,
                    width: `${(layout.ancho / PLANO_ANCHO) * 100}%`,
                    height: `${(layout.alto / PLANO_ALTO) * 100}%`,
                    transform: `rotate(${layout.rotacion}deg)`,
                  }}
                  onPointerDown={(event) => iniciarArrastre(event, mesa)}
                  onClick={() => {
                    if (editandoPlano) {
                      setMesaEditadaId(mesa._id);
                    } else {
                      setMesaSeleccionada(mesa);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (!editandoPlano && (event.key === "Enter" || event.key === " ")) {
                      setMesaSeleccionada(mesa);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`Mesa ${mesa.numero}, ${ocupada ? "ocupada" : "libre"}`}
                >
                  <div className="mesa-plano-contenido" style={{ transform: `rotate(${-layout.rotacion}deg)` }}>
                    <span className="mesa-plano-numero">{mesa.numero}</span>
                    <span className="mesa-plano-estado">{ocupada ? "OCUPADA" : "LIBRE"}</span>
                    <span className="mesa-plano-capacidad">
                      <PeopleAltOutlinedIcon fontSize="inherit" />
                      {mesa.capacidad ?? 4}
                    </span>
                    {pedido && (
                      <span className="mesa-plano-pedido">
                        <ReceiptLongOutlinedIcon fontSize="inherit" />
                        {pedido.estadoPedido}
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          {editandoPlano && mesaEditada && layoutMesaEditada && (
            <aside className="plano-editor-panel">
              <div>
                <span className="editor-eyebrow">Mesa seleccionada</span>
                <h2>{mesaEditada.nombre || `Mesa ${mesaEditada.numero}`}</h2>
              </div>

              <label>
                Forma
                <select
                  value={layoutMesaEditada.forma}
                  onChange={(event) =>
                    actualizarLayout(mesaEditada._id, { forma: event.target.value as FormaMesa })
                  }
                >
                  <option value="RECTANGULAR">Rectangular</option>
                  <option value="CUADRADA">Cuadrada</option>
                  <option value="REDONDA">Redonda</option>
                </select>
              </label>

              <label>
                Ancho
                <input
                  type="range"
                  min={ANCHO_MIN}
                  max={ANCHO_MAX}
                  value={layoutMesaEditada.ancho}
                  disabled={layoutMesaEditada.forma !== "RECTANGULAR"}
                  onChange={(event) =>
                    actualizarLayout(mesaEditada._id, { ancho: Number(event.target.value) })
                  }
                />
                <span>{Math.round(layoutMesaEditada.ancho)} px</span>
              </label>

              <label>
                Alto
                <input
                  type="range"
                  min={ALTO_MIN}
                  max={ALTO_MAX}
                  value={layoutMesaEditada.alto}
                  disabled={layoutMesaEditada.forma !== "RECTANGULAR"}
                  onChange={(event) =>
                    actualizarLayout(mesaEditada._id, { alto: Number(event.target.value) })
                  }
                />
                <span>{Math.round(layoutMesaEditada.alto)} px</span>
              </label>

              {layoutMesaEditada.forma !== "RECTANGULAR" && (
                <label>
                  Tamaño
                  <input
                    type="range"
                    min={ANCHO_MIN}
                    max={ALTO_MAX}
                    value={layoutMesaEditada.ancho}
                    onChange={(event) => {
                      const lado = Number(event.target.value);
                      actualizarLayout(mesaEditada._id, { ancho: lado, alto: lado });
                    }}
                  />
                  <span>{Math.round(layoutMesaEditada.ancho)} px</span>
                </label>
              )}

              <label>
                <span><RotateRightOutlinedIcon fontSize="small" /> Rotación</span>
                <input
                  type="range"
                  min={0}
                  max={359}
                  value={layoutMesaEditada.rotacion}
                  onChange={(event) =>
                    actualizarLayout(mesaEditada._id, { rotacion: Number(event.target.value) })
                  }
                />
                <span>{Math.round(layoutMesaEditada.rotacion)}°</span>
              </label>

              <div className="editor-position">
                <OpenWithOutlinedIcon />
                <span>
                  x {Math.round(layoutMesaEditada.x)} · y {Math.round(layoutMesaEditada.y)}
                </span>
              </div>

              <p className="editor-help">
                Arrastrá la mesa directamente sobre el plano. Los cambios se aplican recién al guardar.
              </p>

              <button
                type="button"
                className="editor-delete-table"
                disabled={mesaEditada.estado === "OCUPADA" || pedidosActivosPorMesa.has(mesaEditada._id)}
                onClick={() => void eliminarMesa(mesaEditada)}
              >
                <DeleteOutlineOutlinedIcon fontSize="small" />
                Eliminar mesa
              </button>

              {(mesaEditada.estado === "OCUPADA" || pedidosActivosPorMesa.has(mesaEditada._id)) && (
                <p className="editor-delete-help">
                  Para eliminarla primero debe quedar libre y sin pedidos activos.
                </p>
              )}
            </aside>
          )}
        </div>
      ) : (
        <p className="mesas-loading">Todavía no hay mesas creadas.</p>
      )}


      {nuevaMesaAbierta && (
        <div className="mesa-modal-backdrop" role="presentation" onMouseDown={() => !creandoMesa && setNuevaMesaAbierta(false)}>
          <article
            className="mesa-modal nueva-mesa-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="nueva-mesa-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="mesa-modal-close"
              type="button"
              disabled={creandoMesa}
              onClick={() => setNuevaMesaAbierta(false)}
            >
              ×
            </button>

            <span className="editor-eyebrow">Administración del salón</span>
            <h2 id="nueva-mesa-title">Nueva mesa</h2>
            <p className="nueva-mesa-help">
              La mesa se crea al confirmar. Después podés ubicarla, redimensionarla y cambiar su forma antes de guardar el plano.
            </p>

            <div className="nueva-mesa-form">
              <label>
                Número
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={nuevaMesa.numero}
                  onChange={(event) => setNuevaMesa((actual) => ({ ...actual, numero: event.target.value }))}
                />
              </label>

              <label>
                Nombre opcional
                <input
                  type="text"
                  maxLength={80}
                  placeholder={`Ej: Ventana · vacío: Mesa ${nuevaMesa.numero || "N"}`}
                  value={nuevaMesa.nombre}
                  onChange={(event) => setNuevaMesa((actual) => ({ ...actual, nombre: event.target.value }))}
                />
              </label>

              <label>
                Capacidad
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={nuevaMesa.capacidad}
                  onChange={(event) => setNuevaMesa((actual) => ({ ...actual, capacidad: event.target.value }))}
                />
              </label>

              <label>
                Observaciones
                <textarea
                  rows={3}
                  placeholder="Ej: Cerca de la ventana"
                  value={nuevaMesa.observaciones}
                  onChange={(event) => setNuevaMesa((actual) => ({ ...actual, observaciones: event.target.value }))}
                />
              </label>
            </div>

            <div className="nueva-mesa-actions">
              <button type="button" className="mesas-cancel-layout" disabled={creandoMesa} onClick={() => setNuevaMesaAbierta(false)}>
                Cancelar
              </button>
              <button type="button" className="mesas-save-layout" disabled={creandoMesa} onClick={() => void crearNuevaMesa()}>
                {creandoMesa ? "Creando..." : "Crear mesa"}
              </button>
            </div>
          </article>
        </div>
      )}

      {!editandoPlano && mesaSeleccionada && (
        <div className="mesa-modal-backdrop" role="presentation" onMouseDown={() => setMesaSeleccionada(null)}>
          <article
            className="mesa-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mesa-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button className="mesa-modal-close" type="button" onClick={() => setMesaSeleccionada(null)}>
              ×
            </button>

            <span className={`mesa-modal-status ${pedidoSeleccionado || mesaSeleccionada.estado === "OCUPADA" ? "ocupada" : "libre"}`}>
              {pedidoSeleccionado || mesaSeleccionada.estado === "OCUPADA" ? "Ocupada" : "Libre"}
            </span>

            <h2 id="mesa-modal-title">{mesaSeleccionada.nombre || `Mesa ${mesaSeleccionada.numero}`}</h2>
            <p>Capacidad: {mesaSeleccionada.capacidad ?? 4} personas</p>

            {pedidoSeleccionado ? (
              <div className="mesa-pedido-detalle">
                <h3>Pedido actual</h3>
                <p><strong>Estado:</strong> {pedidoSeleccionado.estadoPedido}</p>
                <p><strong>Pago:</strong> {pedidoSeleccionado.estadoPago}</p>
                <p>
                  <strong>Hora:</strong>{" "}
                  {new Date(pedidoSeleccionado.fechaPedido).toLocaleTimeString("es-AR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
                <ul>
                  {pedidoSeleccionado.productos.map((producto, index) => (
                    <li key={`${producto.nombreSnapshot}-${index}`}>
                      {producto.cantidad} × {producto.nombreSnapshot}
                    </li>
                  ))}
                </ul>
                <strong className="mesa-total">
                  Total: {formatoPesos(pedidoSeleccionado.totalFinal ?? pedidoSeleccionado.total)}
                </strong>
                {pedidoSeleccionado.comentario && (
                  <p className="mesa-comentario">{pedidoSeleccionado.comentario}</p>
                )}
                {renderAccionesMesa(mesaSeleccionada, pedidoSeleccionado, true)}
              </div>
            ) : (
              <div className="mesa-sin-pedido">
                <p>No hay un pedido activo en esta mesa.</p>
                {renderAccionesMesa(mesaSeleccionada, undefined, true)}
              </div>
            )}

            {mesaSeleccionada.observaciones && (
              <p className="mesa-observaciones">
                <strong>Observaciones:</strong> {mesaSeleccionada.observaciones}
              </p>
            )}
          </article>
        </div>
      )}
    </section>
  );
};

export default Mesas;


