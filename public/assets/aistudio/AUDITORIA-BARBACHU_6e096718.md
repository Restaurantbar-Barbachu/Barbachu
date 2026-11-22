# Auditoría Barbachu — Restaurante Bar & POS

**Fecha:** 21 de noviembre de 2026
**Sitio:** https://barbachu.ai.studio
**Material revisado:** `Barbachu-actualizado.zip` (versión más reciente) y `Barbachu-main.zip`

> **Alcance y límites.** Al abrir el sitio solo se pudieron leer las metaetiquetas, porque la app se dibuja con JavaScript. El análisis sale del código de los dos zips y de compilarlo. **No** se midió Lighthouse ni se vio el diseño renderizado, y no se pudo confirmar que el sitio publicado coincida con esos zips.

---

## 1. Resumen ejecutivo

| Área | Estado inicial | Estado tras esta entrega |
|---|---|---|
| Seguridad | 🔴 PINs en el código y datos solo en `localStorage` | 🔴 Sin cambio (requiere elegir base de datos) |
| Entrada pública | 🔴 La URL abría el login del POS | 🟢 `/` abre el menú; el POS vive en `/pos` |
| Responsive | 🟠 Textos de 9-11px, `vh` en lugar de `dvh` | 🟢 Textos de 12px mínimo, `dvh` |
| Accesibilidad | 🟠 0 atributos `aria-`/`role` | 🟡 Modales con `role="dialog"`; faltan etiquetas de formularios |
| Rendimiento | 🟠 JS de 843 kB en un solo archivo | 🟢 Menú carga ~175 kB (sin gzip) |
| SEO | 🟠 `og:image` relativo, sitemap de otro dominio | 🟢 URLs absolutas, JSON-LD, `robots.txt`, `sitemap.xml` |
| Bug en producción | 🔴 `/api/pedir` incompatible con `"type": "module"` | 🟢 Convertido a ESM |

Leyenda: 🔴 crítico · 🟠 importante · 🟡 parcial · 🟢 resuelto.

---

## 2. Hallazgos por categoría

### 2.1 Seguridad

| # | Hallazgo | Severidad | Estado |
|---|---|---|---|
| S1 | PINs de demostración en `src/storage.ts` (admin `1234`, caja `2222`, meseros `3333-3335`, cocina `4444`). En `main` el admin es `0000`. Cualquiera los lee en el JS publicado. | 🔴 | Pendiente |
| S2 | Ventas, caja e inventario viven solo en `localStorage`: editables desde DevTools, se pierden al borrar caché y no se comparten entre dispositivos. | 🔴 | Pendiente |
| S3 | La ruta por defecto abría el POS; el menú solo aparecía con `?view=menu`. | 🔴 | **Corregido** |
| S4 | `/api/pedir.js` usaba `module.exports` con `"type": "module"` en `package.json`; en Vercel habría fallado y el botón de pedir por WhatsApp no habría funcionado. | 🔴 | **Corregido** (sin probar en Vercel) |
| S5 | `ErrorBoundary` mostraba `error.message` al usuario final. | 🟠 | **Corregido** |
| S6 | En `main`: Firebase y Supabase conviven; `firestore.rules` tiene un correo de admin fijo y `firebase-applet-config.json` está en el repo. Las claves web de Firebase son públicas por diseño, pero conviene restringirlas por dominio. | 🟠 | Pendiente |
| S7 | Faltan cabecera HSTS y la CSP permite `'unsafe-inline'` en estilos. El `vercel.json` solo aplica en Vercel, no necesariamente en `ai.studio`. | 🟡 | Pendiente |
| S8 | `/api/pedir` no tiene límite de peticiones (rate limit). Es seguro (solo redirige a `wa.me`), pero se puede abusar. | 🟡 | Pendiente |

**Lo que ya estaba bien hecho:** RLS en todas las tablas de Supabase, funciones `SECURITY DEFINER` con `search_path` fijo, auditoría inmutable, solo clave publishable en el cliente, número de WhatsApp en variable de entorno (`WA_NUMBER`) y CSP/X-Frame-Options configurados.

### 2.2 Responsive

| # | Hallazgo | Estado |
|---|---|---|
| R1 | `PosView` tiene 65 botones y solo 27 breakpoints. | Pendiente de revisión visual |
| R2 | 47 usos de texto de 9-11px (22 en `PosView`, 18 en `AdminDashboard`, 7 en `PosAnalyticsDashboard`). | **Corregido** → `text-xs` (12px) |
| R3 | `min-h-screen` (3 sitios) causa saltos con la barra del navegador móvil. | **Corregido** → `min-h-dvh` |
| R4 | Soporte de zona segura: existe en `index.css` (`--top`, `--bot`), usado en el padding inferior. El encabezado superior solo lo usa en `scroll-padding`. | Parcial |
| R5 | Verificar que los botones táctiles midan al menos 44 × 44 px. | Pendiente |

> Los textos de 12px pueden apretar algún layout denso del POS. Conviene revisarlo en un celular real.

### 2.3 Diseño

| # | Hallazgo | Estado |
|---|---|---|
| D1 | Paleta oscura con dorado y pareja tipográfica Playfair Display + DM Sans: coherente y adecuada para un bar-restaurante. | ✅ Mantener |
| D2 | `MenuView` no tiene ninguna imagen de platillo (0 `<img>`). | Pendiente |
| D3 | `og:image` era una ruta relativa; WhatsApp y Facebook necesitan URL absoluta. | **Corregido** |
| D4 | El título "Restaurante Bar & POS" exponía el sistema interno a los clientes. | **Corregido** |

### 2.4 Accesibilidad

| # | Hallazgo | Estado |
|---|---|---|
| A1 | 0 atributos `aria-` o `role` en POS, Admin y Analytics. | Parcial |
| A2 | 8 modales (`fixed inset-0`) sin `role="dialog"`. | **Corregido** (`role="dialog" aria-modal="true"`) |
| A3 | ~36 campos de formulario frente a ~23 etiquetas: unos 13 sin `<label>` asociado. | Pendiente |
| A4 | Modales sin atrapar el foco ni cerrar con `Esc`. | Pendiente |

### 2.5 Rendimiento

| # | Hallazgo | Estado |
|---|---|---|
| P1 | Un solo bundle de 843 kB (233 kB gzip) para todo. | **Corregido** con carga diferida |
| P2 | El catálogo de 2,906 líneas viajaba al menú público. | **Corregido** (queda dentro del chunk de `PosView`) |
| P3 | Dos fuentes variables completas bloqueaban el render. | **Corregido**: solo DM Sans 400/500/700 y Playfair 600/700 |
| P4 | Sin caché larga para `/assets/*`. | **Corregido** (`immutable`) |

**Resultado medido en el build:**

| Chunk | Tamaño | gzip | Cuándo se descarga |
|---|---|---|---|
| `index` (núcleo) | 148.9 kB | 48.6 kB | Siempre |
| `MenuView` | 17.1 kB | 5.2 kB | En `/` |
| `BarbachuLogo` | 8.6 kB | 3.8 kB | En `/` |
| **Total del menú público** | **~175 kB** | **~58 kB** | — |
| `PosView` | 114.5 kB | 23.1 kB | Solo en `/pos` |
| `AdminDashboard` | 43.8 kB | 10.3 kB | Solo al abrir Admin |
| `PosAnalyticsDashboard` (con Recharts) | 511.4 kB | 144.1 kB | Solo al abrir Reportes |

El menú pasó de 843 kB a unos 175 kB de JavaScript inicial (aprox. 79 % menos).

### 2.6 SEO y compartir

| # | Hallazgo | Estado |
|---|---|---|
| E1 | Sitemap apuntaba a `barbachu-bar.vercel.app`, dominio distinto al de `ai.studio`. | **Corregido**: se genera con `VITE_SITE_URL` |
| E2 | Sin `canonical` ni datos estructurados. | **Corregido**: `canonical` y JSON-LD `Restaurant` (nombre, URL, imagen y dirección) |
| E3 | El POS podía indexarse. | **Corregido**: `noindex` + `Disallow: /pos` |
| E4 | Al ser SPA, el contenido del menú no es visible para rastreadores que no ejecutan JS. | Pendiente (prerender o SSR) |

### 2.7 Mantenibilidad y operación

| # | Hallazgo | Estado |
|---|---|---|
| M1 | `PosView.tsx` tiene 2,600+ líneas y `AdminDashboard.tsx` 1,378. | Pendiente |
| M2 | Estructura plana. Propuesta (según la guía de carpetas): `components/`, `hooks/`, `services/`, `utils/`, `data/`. | Pendiente |
| M3 | El zip traía `node_modules`, `dist` y una carpeta anidada duplicada. | **Corregido** (zip limpio) |
| M4 | Archivos `favicon.ico` y `og-image.png` duplicados en la raíz y en `public/`. | **Corregido** |
| M5 | Sin modo offline para caídas de Wi-Fi, sin registro de errores en producción, sin respaldos. | Pendiente |
| M6 | Sin aviso de privacidad (LFPDPPP), facturación ni manejo de propinas. | Pendiente |

---

## 3. Correcciones a mi auditoría inicial

Al revisar el código a fondo, dos afirmaciones de mi primer informe resultaron imprecisas:

1. **Botones solo con ícono sin nombre:** no es un problema real. Analicé el código con el compilador de TypeScript y los botones que parecían solo ícono tienen texto en elementos anidados. Lo que sí falta son etiquetas en formularios (A3) y roles en modales (A2, ya corregido).
2. **Zona segura (`safe-area-inset`):** dije que no la vi, pero `index.css` define `--top` y `--bot` y usa `--bot` en el padding inferior. Está parcialmente cubierta (R4).

---

## 4. Mejoras aplicadas (detalle técnico)

| Archivo | Cambio |
|---|---|
| `src/App.tsx` | Ruteo por ruta (`/`, `/menu`, `/pos`) con `history.pushState` y `popstate`; compatibilidad con `?view=`. `React.lazy` + `Suspense` para `MenuView` y `PosView`. `noindex` dinámico en el POS. Aviso visible de "modo local de pruebas" en el POS. `ErrorBoundary` sin mensaje interno en producción. |
| `src/components/PosView.tsx` | `AdminDashboard` y `PosAnalyticsDashboard` con carga diferida y `Suspense`. 5 modales con `role="dialog"`. |
| `src/components/AdminDashboard.tsx`, `MenuView.tsx` | Modales con `role="dialog" aria-modal="true"`. |
| Todos los `.tsx` | `text-[9px]/[10px]/[11px]` → `text-xs`; `min-h-screen` → `min-h-dvh`. |
| `index.html` | Título público sin "POS", `canonical`, Open Graph y Twitter con URL absoluta, JSON-LD `Restaurant`, fuentes recortadas. |
| `vite.config.ts` | Plugin que sustituye `__SITE_URL__` y genera `robots.txt` y `sitemap.xml`. |
| `api/pedir.js` | De CommonJS a ESM (`export default function handler`). |
| `vercel.json` | Caché `immutable` para `/assets/*`. |
| `.env.example` | Nueva variable `VITE_SITE_URL`. |
| `README.md`, `docs/` | Rutas, flujo para Spck Editor y este informe. |

**Verificación:** `tsc --noEmit` sin errores y `vite build` correcto. El nuevo `api/pedir.js` pasó la comprobación de sintaxis, pero no se ejecutó en Vercel.

---

## 5. Pendientes y plan de acción

### Prioridad alta (bloquean ventas reales)
1. **Elegir base de datos** (sección 6).
2. Reemplazar los PINs por autenticación real (Supabase Auth o equivalente).
3. Mover pedidos, caja e inventario fuera de `localStorage`.

### Prioridad media
4. Etiquetas `<label>` en ~13 campos y manejo de foco/`Esc` en modales.
5. Revisión visual en celular y tablet; botones táctiles de 44 px.
6. Imágenes de platillos con `alt` en el menú.
7. Activar HSTS cuando el dominio definitivo esté verificado.
8. Restringir por dominio las claves de Firebase (si se conserva) y quitar el correo fijo de `firestore.rules`.

### Prioridad baja
9. Dividir `PosView.tsx` y `AdminDashboard.tsx` en módulos.
10. Rate limit en `/api/pedir`.
11. Prerender del menú para SEO.
12. Aviso de privacidad, registro de errores y respaldos.

---

## 6. Alternativas de base de datos

Precios y límites gratuitos cambian: confírmalos en cada sitio antes de decidir.

| Opción | Ventajas | Desventajas |
|---|---|---|
| **Supabase** (ya en el proyecto) | Postgres + Auth + tiempo real + RLS. Migraciones y funciones RPC ya escritas. Ideal para datos relacionales. | El plan gratis puede pausar el proyecto por inactividad (inaceptable en un POS). Sin offline nativo. |
| **Firebase (Firestore)** | Mejor offline nativo y tiempo real. | NoSQL: reportes e inventario cuestan más. Cobra por lecturas/escrituras, que un POS con pantalla de cocina dispara. |
| **PocketBase en el local** | Un binario con SQLite + Auth + tiempo real. Funciona por LAN sin internet y encaja con el monitor de cocina ESP8266. | Respaldos, actualizaciones y mantener el equipo encendido son tu responsabilidad. |
| **Neon + Auth aparte** | Postgres puro, arranque rápido. | Hay que escribir la API y conectar el login. |
| **SQLite local con sincronización** (PowerSync, ElectricSQL, Turso) | Offline real; vendes sin internet y sincroniza después. | La más compleja. |

**Recomendación:** Supabase en plan de pago + cola offline en IndexedDB para ventas sin internet. Si el internet del local falla con frecuencia y quieres independencia de la nube, PocketBase en el local.

---

## 7. Cómo desplegar

1. Descomprime `barbachu-pos-spck.zip` y ábrelo en Spck Editor (o clónalo desde GitHub).
2. Edita, luego `Git → Commit → Push`.
3. Vercel compila con `npm run build` y publica.
4. En Vercel → Settings → Environment Variables define: `VITE_SITE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` y `WA_NUMBER`.

> Spck edita y sube a Git, pero no ejecuta `npm` ni Vite.

---

## 8. Advertencia operativa

Hasta completar los puntos 1-3 de la sección 5, **el POS no es seguro para registrar ventas reales**: los PINs son visibles y los datos se pueden alterar desde el navegador. El POS ahora muestra un aviso de "modo local de pruebas" para recordarlo.
