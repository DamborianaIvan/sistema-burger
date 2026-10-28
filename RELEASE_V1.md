> Referencia heredada de la base original. No constituye una validación ni un release de Sistema Burger. Para el alcance actual, ver README.md y docs/BASE_Y_ALCANCE.md.

# Pepe's Napoletana — Release v1

Checklist operativa para validar un release antes de desplegar.

## 1. Configuración

- [ ] `NODE_ENV` definido para el entorno
- [ ] `MONGODB_URI` apunta a la base correcta
- [ ] `JWT_SECRET` es único, aleatorio y de al menos 32 caracteres
- [ ] `CORS_ORIGINS` contiene solo orígenes permitidos
- [ ] `VITE_API_URL` apunta al backend correcto
- [ ] no existen archivos `.env` versionados

## 2. Validación automática

Backend:

```bash
cd backend
npm test
```

Panel:

```bash
cd panel
npm run build
npm run lint
```

Resultado requerido: todos los comandos deben finalizar sin errores.

## 3. Healthcheck

Con backend y MongoDB activos:

```text
GET /api/health
```

Debe responder HTTP 200 con:

- `status: ok`
- `database: connected`

## 4. Smoke test manual

### Autenticación

- [ ] ADMIN inicia sesión
- [ ] CAJERO inicia sesión
- [ ] CHEF inicia sesión
- [ ] DELIVERY inicia sesión
- [ ] usuario inactivo no puede ingresar
- [ ] navegación respeta permisos

### Salón

- [ ] crear pedido desde mesa libre
- [ ] mesa pasa a ocupada
- [ ] pedido aparece en Cocina
- [ ] EN_COCINA → LISTO → SERVIDO
- [ ] abrir caja
- [ ] cobrar pedido
- [ ] imprimir ticket
- [ ] cerrar pedido
- [ ] mesa vuelve a libre
- [ ] pedido ya no aparece como activo
- [ ] historial lo muestra como Cerrado

### Takeaway

- [ ] crear pedido
- [ ] EN_COCINA → LISTO → ENTREGADO
- [ ] cobrar y cerrar

### Delivery

- [ ] crear pedido con cliente/dirección
- [ ] cocina lo lleva de EN_COCINA → LISTO
- [ ] DELIVERY inicia sesión y entra directo a su pantalla PEDIDOS
- [ ] DELIVERY no ve Home, Mesas ni historial general
- [ ] DELIVERY ve solo pedidos disponibles para reparto
- [ ] DELIVERY marca el pedido como ENTREGADO
- [ ] el pedido desaparece de su cola
- [ ] cobrar y cerrar desde Caja

### Caja

- [ ] apertura con monto inicial
- [ ] pagos simples
- [ ] pagos divididos
- [ ] descuento
- [ ] anulación de cobro
- [ ] cierre de caja
- [ ] arqueo y diferencia correctos

### Stock

- [ ] entrada manual
- [ ] salida / merma
- [ ] ajuste
- [ ] receta configurada
- [ ] cierre de venta genera consumo automático
- [ ] alerta de mínimo visible

### Mesas

- [ ] mover y guardar layout
- [ ] crear mesa
- [ ] retirar mesa sin historial
- [ ] archivar mesa con historial
- [ ] no permite retirar mesa ocupada

### Reportes

- [ ] hoy
- [ ] últimos 7 días
- [ ] este mes
- [ ] rango personalizado
- [ ] importes coinciden con ventas/caja
- [ ] stock y alertas coherentes

### Auditoría

- [ ] eventos de pedidos
- [ ] cobros y anulaciones
- [ ] caja
- [ ] stock
- [ ] usuarios
- [ ] productos
- [ ] cambio de contraseña no expone contraseña
- [ ] solo ADMIN puede consultar auditoría

## 5. Datos y backup

Antes de un despliegue sobre una instalación real:

- [ ] generar backup de MongoDB
- [ ] verificar restauración o procedimiento de rollback
- [ ] confirmar que los índices de MongoDB fueron creados
- [ ] no borrar datos históricos durante el deploy

## 6. Observabilidad

Después del deploy:

- [ ] revisar `/api/health`
- [ ] revisar logs de arranque
- [ ] revisar errores HTTP inesperados
- [ ] realizar una operación de prueba y confirmar auditoría

## 7. Criterio de salida

El release se considera listo cuando:

- tests backend pasan;
- build y lint del panel pasan;
- healthcheck está OK;
- smoke test principal pasa;
- no hay secretos versionados;
- documentación coincide con el comportamiento actual.

