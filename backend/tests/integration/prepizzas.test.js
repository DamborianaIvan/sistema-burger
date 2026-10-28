import test, { before, beforeEach, after, describe } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  VariedadPrepizza,
  ComercioPrepizza,
  PedidoPrepizza,
  MovimientoPrepizza,
} from "../../models/Prepizza.js";
import Ingrediente from "../../models/Ingrediente.js";
import MovimientoStock from "../../models/MovimientoStock.js";
import Caja from "../../models/Caja.js";
import MovimientoCaja from "../../models/MovimientoCaja.js";
import {
  INTEGRATION_ENABLED,
  authorization,
  conectarBaseDePrueba,
  crearUsuario,
  desconectarBaseDePrueba,
  detenerServidorDePrueba,
  iniciarServidorDePrueba,
  limpiarPedidos,
  limpiarUsuarios,
  loginComo,
  requestJson,
} from "./testSetup.js";

describe(
  "integración: producción y venta de prepizzas",
  { skip: !INTEGRATION_ENABLED },
  () => {
    let token, usuario;
    before(async () => {
      await conectarBaseDePrueba();
      await iniciarServidorDePrueba();
      await Promise.all([
        VariedadPrepizza.init(),
        ComercioPrepizza.init(),
        PedidoPrepizza.init(),
        MovimientoPrepizza.init(),
        Caja.init(),
      ]);
    });
    beforeEach(async () => {
      await limpiarPedidos();
      await limpiarUsuarios();
      usuario = await crearUsuario();
      token = (await loginComo("admin-test", "password-admin-123")).token;
    });
    after(async () => {
      await detenerServidorDePrueba();
      await desconectarBaseDePrueba();
    });
    const post = (path, body = {}, auth = token) =>
      requestJson("/api/prepizzas" + path, {
        method: "POST",
        headers: authorization(auth),
        body: JSON.stringify(body),
      });
    const ok = (r, status = 201) => {
      assert.equal(r.response.status, status, JSON.stringify(r.body));
      return r.body;
    };
    const base = async () => {
      const ingrediente = await Ingrediente.create({
        nombre: "Harina",
        unidad: "KG",
        stockActual: 100,
      });
      const variedad = ok(
        await post("/variedades", {
          nombre: "Clásica",
          precio: 1000,
          componentes: [
            { ingredienteId: String(ingrediente._id), cantidad: 0.2 },
          ],
        }),
      );
      const comercio = ok(await post("/comercios", { nombre: "Almacén Juan" }));
      return { ingrediente, variedad, comercio };
    };
    const producir = (v, n = 100, clave = randomUUID(), consumir = true) =>
      post("/movimientos", {
        variedadId: v._id,
        cantidad: n,
        tipo: "PRODUCCION",
        consumirIngredientes: consumir,
        claveOperacion: clave,
      });
    const pedido = (b, n = 20) =>
      post("/pedidos", {
        comercioId: b.comercio._id,
        items: [{ variedadId: b.variedad._id, cantidad: n }],
        claveOperacion: randomUUID(),
      });
    const abrirCaja = () =>
      requestJson("/api/caja/abrir", {
        method: "POST",
        headers: authorization(token),
        body: JSON.stringify({ montoInicial: 0 }),
      });
    test("produce, entrega una sola vez y cobra en cuotas con trazabilidad de caja y reportes", async () => {
      const b = await base();
      const clave = randomUUID();
      ok(await producir(b.variedad, 100, clave));
      ok(await producir(b.variedad, 100, clave));
      assert.equal(
        (await Ingrediente.findById(b.ingrediente._id)).stockActual,
        80,
      );
      const p = ok(await pedido(b));
      // El precio histórico queda fijo aunque cambie la variedad.
      await VariedadPrepizza.updateOne(
        { _id: b.variedad._id },
        { precio: 2000 },
      );
      ok(await post(`/pedidos/${p._id}/entregar`), 200);
      ok(await post(`/pedidos/${p._id}/entregar`), 200);
      assert.equal(
        (await VariedadPrepizza.findById(b.variedad._id)).stockActual,
        80,
      );
      assert.equal(
        (await Ingrediente.findById(b.ingrediente._id)).stockActual,
        80,
      );
      assert.equal(
        await MovimientoPrepizza.countDocuments({ tipo: "ENTREGA" }),
        1,
      );
      const comercio = await ComercioPrepizza.findById(b.comercio._id);
      assert.equal(
        comercio.proximoSeguimiento - comercio.ultimaEntrega,
        5 * 86400000,
      );
      assert.equal(
        (
          await post(`/pedidos/${p._id}/cobros`, {
            monto: 8000,
            metodo: "EFECTIVO",
            claveOperacion: randomUUID(),
          })
        ).response.status,
        409,
      );
      ok(await abrirCaja());
      const pago = {
        monto: 8000,
        metodo: "EFECTIVO",
        claveOperacion: randomUUID(),
      };
      let parcial = ok(await post(`/pedidos/${p._id}/cobros`, pago), 200);
      assert.equal(parcial.saldo, 12000);
      assert.equal(parcial.estadoCobro, "PARCIAL");
      ok(await post(`/pedidos/${p._id}/cobros`, pago), 200);
      assert.equal((await Caja.findOne()).totalesPorMetodo.EFECTIVO, 8000);
      const fin = ok(
        await post(`/pedidos/${p._id}/cobros`, {
          monto: 12000,
          metodo: "TRANSFERENCIA",
          claveOperacion: randomUUID(),
        }),
        200,
      );
      assert.equal(fin.estadoCobro, "PAGADO");
      assert.equal(fin.saldo, 0);
      assert.equal(fin.total, 20000);
      assert.equal(
        await MovimientoCaja.countDocuments({ pedidoPrepizzaId: p._id }),
        2,
      );
      const hoy = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Argentina/Buenos_Aires",
      }).format(new Date());
      const r = await requestJson(
        `/api/reportes/resumen?desde=${hoy}&hasta=${hoy}`,
        { headers: authorization(token) },
      );
      assert.equal(r.response.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.prepizzas.vendido, 20000);
      assert.equal(r.body.prepizzas.cobrado, 20000);
      assert.equal(r.body.prepizzas.producido, 100);
      assert.equal(r.body.prepizzas.pendiente, 0);
      assert.equal(r.body.resumenGeneral.ventas, 20000);
    });
    test("rechaza producción y entregas sin stock y revierte todos los componentes", async () => {
      const b = await base();
      const escaso = await Ingrediente.create({
        nombre: "Salsa",
        unidad: "KG",
        stockActual: 0,
      });
      await VariedadPrepizza.updateOne(
        { _id: b.variedad._id },
        { $push: { componentes: { ingredienteId: escaso._id, cantidad: 1 } } },
      );
      assert.equal((await producir(b.variedad)).response.status, 409);
      assert.equal(
        (await Ingrediente.findById(b.ingrediente._id)).stockActual,
        100,
      );
      assert.equal(await MovimientoStock.countDocuments({}), 0);
      assert.equal(
        (await VariedadPrepizza.findById(b.variedad._id)).stockActual,
        0,
      );
      const p = ok(await pedido(b));
      assert.equal(
        (await post(`/pedidos/${p._id}/entregar`)).response.status,
        409,
      );
      assert.equal((await PedidoPrepizza.findById(p._id)).estado, "PENDIENTE");
      ok(await producir(b.variedad, 10, randomUUID(), false));
      const baja = {
        tipo: "BAJA",
        variedadId: b.variedad._id,
        cantidad: 11,
        motivo: "Vencimiento",
        consumirIngredientes: false,
        claveOperacion: randomUUID(),
      };
      assert.equal((await post("/movimientos", baja)).response.status, 409);
      ok(
        await post("/movimientos", {
          ...baja,
          cantidad: 2,
          claveOperacion: randomUUID(),
        }),
      );
      assert.equal(
        (await VariedadPrepizza.findById(b.variedad._id)).stockActual,
        8,
      );
    });
    test("entregas concurrentes no dejan stock negativo ni descuentan dos veces", async () => {
      const b = await base();
      ok(await producir(b.variedad, 20, randomUUID(), false));
      const a = ok(await pedido(b, 15)),
        c = ok(await pedido(b, 15));
      const resultados = await Promise.all([
        post(`/pedidos/${a._id}/entregar`),
        post(`/pedidos/${c._id}/entregar`),
      ]);
      assert.deepEqual(
        resultados.map((r) => r.response.status).sort(),
        [200, 409],
      );
      assert.equal(
        (await VariedadPrepizza.findById(b.variedad._id)).stockActual,
        5,
      );
    });
    test("cobros concurrentes no superan el saldo y la cancelación exige no tener pagos", async () => {
      const b = await base();
      const p = ok(await pedido(b));
      ok(await abrirCaja());
      const resultados = await Promise.all(
        [1, 2].map(() =>
          post(`/pedidos/${p._id}/cobros`, {
            monto: 15000,
            metodo: "EFECTIVO",
            claveOperacion: randomUUID(),
          }),
        ),
      );
      assert.deepEqual(
        resultados.map((r) => r.response.status).sort(),
        [200, 409],
      );
      assert.equal((await Caja.findOne()).totalesPorMetodo.EFECTIVO, 15000);
      assert.equal(
        (await post(`/pedidos/${p._id}/cancelar`, { motivo: "Error" })).response
          .status,
        409,
      );
      const otro = ok(await pedido(b));
      ok(
        await post(`/pedidos/${otro._id}/cancelar`, {
          motivo: "No lo necesita",
        }),
        200,
      );
      assert.equal(
        (await post(`/pedidos/${otro._id}/entregar`)).response.status,
        409,
      );
    });
    test("el contacto reprograma el aviso y conserva el historial", async () => {
      const b = await base();
      await ComercioPrepizza.updateOne(
        { _id: b.comercio._id },
        {
          ultimaEntrega: new Date(Date.now() - 6 * 86400000),
          proximoSeguimiento: new Date(Date.now() - 86400000),
        },
      );
      let resumen = await requestJson("/api/prepizzas/resumen", {
        headers: authorization(token),
      });
      assert.equal(resumen.body.comercios[0].requiereContacto, true);
      ok(
        await post(`/comercios/${b.comercio._id}/contactos`, {
          nota: "Todavía tiene. Consultar en tres días.",
          diasHastaContacto: 3,
        }),
      );
      resumen = await requestJson("/api/prepizzas/resumen", {
        headers: authorization(token),
      });
      assert.equal(resumen.body.comercios[0].requiereContacto, false);
      assert.equal(resumen.body.comercios[0].contactos.length, 1);
    });
    test("CAJERO opera pedidos y cobros; CHEF y DELIVERY no acceden; stock solo ADMIN", async () => {
      for (const rol of ["CAJERO", "CHEF", "DELIVERY"]) {
        await crearUsuario({
          nombreUsuario: rol.toLowerCase(),
          email: `${rol}@test.com`,
          rol,
        });
        const login = await loginComo(rol.toLowerCase(), "password-admin-123");
        const r = await requestJson("/api/prepizzas/resumen", {
          headers: authorization(login.token),
        });
        assert.equal(r.response.status, rol === "CAJERO" ? 200 : 403);
        assert.equal(
          (
            await post(
              "/variedades",
              { nombre: "No permitido", precio: 1000 },
              login.token,
            )
          ).response.status,
          403,
        );
      }
      assert.equal(
        (await requestJson("/api/prepizzas/resumen")).response.status,
        401,
      );
    });
    test("reporte distingue fechas de ventas y cobros y conserva la deuda histórica", async () => {
      const b = await base();
      const p = ok(await pedido(b));
      await PedidoPrepizza.collection.updateOne(
        { _id: new (await import("mongoose")).default.Types.ObjectId(p._id) },
        {
          $set: {
            createdAt: new Date("2026-01-01T15:00:00Z"),
            estado: "ENTREGADO",
            fechaEntrega: new Date("2026-01-02T15:00:00Z"),
            cobrado: 20000,
            cobros: [
              {
                claveOperacion: "enero",
                monto: 8000,
                metodo: "EFECTIVO",
                fecha: new Date("2026-01-02T16:00:00Z"),
                usuarioId: usuario._id,
                cajaId: usuario._id,
              },
              {
                claveOperacion: "febrero",
                monto: 12000,
                metodo: "TRANSFERENCIA",
                fecha: new Date("2026-02-02T16:00:00Z"),
                usuarioId: usuario._id,
                cajaId: usuario._id,
              },
            ],
          },
        },
      );
      const r = await requestJson(
        "/api/reportes/resumen?desde=2026-01-01&hasta=2026-01-31",
        { headers: authorization(token) },
      );
      assert.equal(r.body.prepizzas.vendido, 20000);
      assert.equal(r.body.prepizzas.cobrado, 8000);
      assert.equal(r.body.prepizzas.pendiente, 12000);
      const febrero = await requestJson(
        "/api/reportes/resumen?desde=2026-02-01&hasta=2026-02-28",
        { headers: authorization(token) },
      );
      assert.equal(febrero.body.prepizzas.vendido, 0);
      assert.equal(febrero.body.prepizzas.cobrado, 12000);
      assert.equal(febrero.body.prepizzas.pendiente, 0);
    });
  },
);

