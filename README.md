# Barbachu — Restaurante Bar & POS Operativo

Sistema integral y operativo de **Punto de Venta (POS)** y **Menú Digital** para **Barbachu Restaurante Bar**  desarrollado en React + TypeScript con arquitectura local-first para operación en tiempo real.

---

## Módulos y Funcionalidades Operativas

### 1. Resumen General (Dashboard)
- Métricas en vivo del día: total de ventas recaudadas, número de comandas abiertas, ocupación del salón y pedidos pendientes en cocina/barra.
- Actividad reciente en tiempo real con folios, mesas y montos.
- Estado operativo del catálogo (199 productos SoftRestaurant cargados, 121 insumos de almacén).

### 2. Punto de Venta (Comandero Táctil)
- **Catálogo SoftRestaurant completo**: Búsqueda instantánea por nombre o clave (ej. 701, 729) y filtrado por categorías (*Alas, Cerveza, Botanas, Platillos, Cortes, Hamburguesas, Boneles, Cubetas, Destilados, Extras, Micheladas, Bebidas*).
- **Zonas y Servicios**:
  - Salón Principal: Mesas 1 a 8
  - Terraza / Barra Exterior: Bancos 1 a 6
  - Barra Interior: Bancos 1 a 3
  - Mostrador / Para Llevar
  - Servicio a Domicilio: Captura de nombre, teléfono, dirección y referencias del cliente
- **Múltiples cuentas por mesa**: Permite abrir cuentas independientes en la misma mesa sin mezclar consumos.
- **Notas de preparación por producto**: Indicaciones personalizadas por cada platillo hacia cocina o barra.
- **Acciones operativas avanzadas**:
  - *División de cuenta*: Separar productos específicos en una nueva cuenta independiente.
  - *Traspaso de productos*: Transferir partidas entre cuentas de la misma mesa o ubicación.
  - *Cambio de ubicación*: Mover la cuenta completa a otra mesa o banco.
  - *Cancelación justificada*: Cancelación de partidas o cuenta con motivo registrado en la bitácora.
  - *Descuento autorizado*: Aplicación de descuentos en pesos con registro de motivo.
  - *Prioridad alta*: Marca visual de urgencia para cocina/barra.

### 3. Mapa de Mesas y Salón
- Tablero visual en tiempo real de todas las ubicaciones: libre (verde) u ocupada (dorado con monto acumulado y cuentas activas).
- Acceso directo a la cuenta con un solo toque.

### 4. Cocina & Barra KDS (Kitchen Display System)
- Tablero Kanban interactivo con filtrado por estación (Cocina, Barra o Todas).
- Estados de comanda: `RECIBIDA` → `EN PREPARACIÓN` → `LISTA PARA ENTREGAR` → `ENTREGADA EN MESA`.
- Identificación clara de mesero, tiempo transcurrido, notas de preparación y prioridad alta.

### 5. Caja & Cobros
- **Fondo de caja inicial**: Control del dinero base del turno ($1,000.00 MXN por defecto).
- **Métodos de pago**: Efectivo (con calculadora de cambio automática y billetes rápidos), Tarjeta (débito/crédito), Transferencia SPEI y Pago Mixto.
- **Ticket imprimible**: Formato estándar de 80mm para impresoras térmicas con folio consecutivo `BC-XXXXX`, desglose de productos, mesero, fecha y hora.
- **Arqueo y Corte de Turno (Corte Z)**:
  - Total esperado en efectivo vs conteo físico del cajón.
  - Cálculo automático de diferencia (sobrante / faltante).
- **Reapertura de venta**: Generación de nueva cuenta a partir de una venta anterior para correcciones, preservando el histórico.
- **Exportación a CSV**: Descarga en archivo `.csv` de todas las ventas de la jornada con detalle de productos, métodos e importes.
- **Bitácora de auditoría**: Registro inmutable de cancelaciones, descuentos, aperturas y cortes.

### 6. Control de Inventario
- 121 insumos reales del restaurante con clave, unidad (KG, LT, PZA), costos unitarios y costos promedio.
- Búsqueda en tiempo real y semáforos de stock bajo.
- Registro de compras / entradas de almacén y ajustes justificados de existencias.

### 7. Reportes & Estadísticas con Recharts (`PosAnalyticsDashboard.tsx`)
- **Gráficas de ventas diarias interactivas**: `AreaChart` y `BarChart` con gradiente dorado oficial `#c8a84b` a `#0a0a0b`, comparativa de tickets e ingresos día por día.
- **Detección de horas pico**: Alternador de visualización de ventas por hora del turno para identificar horarios de mayor demanda en sala y cocina.
- **Ranking de productos más vendidos**: `BarChart` horizontal clasificado por *Ingresos generados ($ MXN)* o *Unidades vendidas*, con podio de medallas (🥇, 🥈, 🥉), desglose por categoría y porcentaje de participación.
- **Distribución de métodos de pago**: `PieChart` / Donut chart interactivo (Efectivo en verde `#25d366`, Tarjeta en dorado `#c8a84b` y Transferencia en azul `#3b82f6`).
- **Ventas por familia / categoría**: Gráfica de barras comparando la rotación de *Alas, Cervezas, Micheladas, Platillos, Cortes, etc.*
- **Tarjetas de KPIs de desempeño**: Ventas de hoy, Ticket promedio, Productos servidos y Tasa de ocupación de salón en tiempo real.

### 8. Menú Digital Barbachu (Cliente)
- Vista elegante con diseño oscuro y dorado.
- Navegación rápida por chips de especialidades, platillos, bebidas y cervezas.
- Modal de detalle y botón directo para pedir por WhatsApp .
