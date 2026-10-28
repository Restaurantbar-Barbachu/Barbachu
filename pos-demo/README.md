# POS Barbachu · Demo pública

Prototipo estático de POS para revisión de interfaz y flujo. Contiene exclusivamente información sintética; no procesa pagos, no conecta con SoftRestaurant y no debe usarse para ventas reales.

## Probar localmente

Desde esta carpeta, con Node.js 24, Python 3 y pnpm 11:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm test
python -m unittest tests/test_demo_catalog.py -v
pnpm test:ui
```

`pnpm test:ui` inicia un servidor estático de Python y ejecuta el recorrido en Chromium con viewport de celular de 360 × 800. Los cobros son simulados y el inventario se guarda solo en el `localStorage` del navegador bajo `barbachu.pos-demo.v1`. El botón **Reiniciar demo** borra esa clave y restaura el catálogo ficticio.

## Publicación de demo

Después de integrar la carpeta `pos-demo/` en la rama `main`, GitHub Pages del repositorio sirve el prototipo en `/pos-demo/`; el sitio actual de la raíz permanece intacto. Este pull request incorpora checks de GitHub Actions, pero no despliega Pages ni cambia la rama principal. Actions publica un resumen del recorrido y conserva el reporte/captura como artifact por 14 días.

## Límite de la demo

Los cambios permanecen en un único navegador y dispositivo. No hay inicio de sesión, sincronización, base de datos ni control de acceso. Esa capa requiere la siguiente fase privada con Vercel y Supabase; esta demo pública no contiene credenciales ni datos operativos.
