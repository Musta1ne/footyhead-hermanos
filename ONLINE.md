# Jugar desde dos casas

La web necesita un servidor Node.js encendido: no alcanza con subir archivos a GitHub Pages. Ambos jugadores se conectan al mismo servidor usando un enlace HTTPS.

## Publicar en Render

Esta es una opción compatible con Node y WebSockets. Elegí una sola instancia. No necesita base de datos, disco persistente ni servicios adicionales.

1. Creá un repositorio tuyo en GitHub y subí **el contenido de esta carpeta adaptada**, incluyendo client, server, package.json y los tres package-lock.json. No subas node_modules ni carpetas build/dist. Si conectás el repositorio original del autor, no tendrás estos arreglos.
2. En Render elegí **New → Web Service** y conectá tu repositorio.
3. Configurá:
   - Language: **Node**.
   - Root Directory: vacío si package.json está en la raíz de tu repositorio.
   - Build Command: `npm run setup && npm run build`.
   - Start Command: `npm start`.
   - Variable `NODE_ENV`: `production`.
   - Variable `NODE_VERSION`: `22`.
   - Health Check Path: `/health`.
   - Instancias: **1**.
4. Elegí la región más cercana a ustedes y revisá el precio del plan antes de contratarlo.
5. Cuando termine el despliegue, abrí la URL HTTPS que te dé Render.
6. Creá una sala, entrá y mandale el enlace a tu hermano. Él abre ese mismo enlace y empieza la partida.

No cambies ninguna IP en el código ni abras puertos del router. El alojamiento proporciona PORT y el juego usa el dominio de la página para HTTP y WebSockets seguros.

Documentación oficial consultada: [Node/Express](https://render.com/docs/deploy-node-express-app) y [WebSockets](https://render.com/docs/websocket).

## Si algo falla

| Síntoma | Qué revisar |
| --- | --- |
| Tu hermano no puede abrir localhost | Usen la dirección HTTPS del alojamiento. |
| Sala cerrada o inexistente | Creen una nueva; puede haber caducado o reiniciado el servidor. |
| Sala llena | Cerrá pestañas duplicadas y creen otra partida. Sólo entran dos jugadores. |
| Pantalla de espera | Falta que entre el segundo jugador al mismo enlace. |
| No conecta en producción | Debe ser un Web Service con WebSockets, una instancia y el mismo puerto para web y juego. |
| Error al compilar | Revisá Node 22+, los tres lockfiles y el registro de la compilación. |
| Mucho retraso | Prueben una región más cercana, cable o Wi-Fi estable y sin descargas simultáneas. |
| Se corta al actualizar la página | Por ahora la desconexión cierra la sala; no hay reconexión automática. |

## Comprobación desde sus casas

Entren desde computadoras distintas. Cada uno mueve su jugador y patea. Confirmen que ambos ven el mismo marcador después de un gol. Cierren una pestaña y creen otra sala para comprobar el reinicio.

La versión preparada es para uso pequeño entre ustedes; antes de abrirla a desconocidos conviene migrar las dependencias antiguas y agregar límites por IP. No hay cuentas ni historial de partidas.
