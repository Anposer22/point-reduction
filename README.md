# Point Reduction Web Application

Aplicación web para:

- Leer CSV con delimitador `,` o `;` (detección automática).
- Detectar automáticamente si el archivo incluye cabeceras.
- Mostrar columnas en pares (X/Y), con preview de los primeros 5 valores.
- Permitir elegir columnas X e Y y color por cada curva.
- Interpolar linealmente todas las curvas sobre una malla común de X.
- Reducir la malla a `N` puntos preservando la forma con una variante multi-curva de Visvalingam-Whyatt.
- Descargar el resultado en CSV separado por `;`.

## Requisitos

- Node.js 20+ y npm.

## Desarrollo local

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Despliegue en GitHub Pages

1. Crea el repositorio en GitHub.
2. Asegúrate de que `vite.config.ts` tenga `base: "./"` (ya está configurado).
3. Activa GitHub Pages en el repositorio para usar **GitHub Actions** como fuente.
4. Haz push a `main`. El workflow `Deploy to GitHub Pages` publicará automáticamente `dist`.
5. Si prefieres despliegue manual desde local, ejecuta:

```bash
npm run deploy
```

Esto publicará el contenido de `dist` en la rama `gh-pages` usando el script local.
