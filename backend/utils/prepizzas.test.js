import test from "node:test";
import assert from "node:assert/strict";
import {
  numeroPrepizza,
  centavos,
  estadoCobroPrepizza,
  seguimientoPendiente,
  proximoContacto,
} from "./prepizzas.js";
test("cantidades y moneda rechazan datos inválidos y mantienen centavos", () => {
  for (const valor of [null, true, "", " ", NaN, Infinity, -1])
    assert.throws(() => numeroPrepizza(valor));
  assert.throws(() => numeroPrepizza(1.5, { entero: true }));
  assert.equal(centavos("123.45"), 12345);
  assert.equal(estadoCobroPrepizza({ total: 20000, cobrado: 8000 }), "PARCIAL");
  assert.equal(estadoCobroPrepizza({ total: 20000, cobrado: 20000 }), "PAGADO");
});
test("el seguimiento vence a los cinco días y se puede reprogramar", () => {
  const fecha = new Date("2026-10-01T15:00:00Z");
  const comercio = {
    activo: true,
    proximoSeguimiento: proximoContacto(fecha, 5),
  };
  assert.equal(
    seguimientoPendiente(comercio, new Date("2026-10-06T14:59:59Z")),
    false,
  );
  assert.equal(
    seguimientoPendiente(comercio, new Date("2026-10-06T15:00:00Z")),
    true,
  );
  assert.equal(
    seguimientoPendiente(
      { ...comercio, activo: false },
      new Date("2026-10-07"),
    ),
    false,
  );
  assert.equal(
    seguimientoPendiente({ activo: true, proximoSeguimiento: null }),
    false,
  );
});

