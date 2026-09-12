# Alojamiento y conexión online

## Qué camino usa la partida

La página sigue en Sites. WebRTC intenta todas las rutas (`iceTransportPolicy: all`): conexión directa y TURN si está configurado. Los candidatos ICE se envían mientras aparecen (trickle ICE), sin esperar a que todos los STUN/TURN contesten. Hay hasta 20 segundos para conectar desde que se recibe la descripción del otro jugador. Las listas de candidatos son privadas para los participantes, acumulativas y acotadas; un reintento atrasado no reemplaza una lista más nueva. Una vez conectado, el juego deja de consultar la señalización.

- **Directa:** teclas y estados viajan entre las casas. El alojamiento de la página no participa en esos paquetes.
- **Por TURN:** WebRTC pasa por un repetidor; su ubicación y la ruta de ambos proveedores importan. Preferir un servicio con UDP y conservar TCP/TLS para redes que bloquean UDP.
- **Por servidor:** respaldo HTTPS que intercambia buzones en D1. No es TURN ni un servidor de juego de baja latencia. Cada recorrido incluye solicitudes y acceso a la base; puede producir demoras muy altas. El juego lo indica y avisa si faltan credenciales TURN.

El canal `game` no ordena ni retransmite paquetes. Si tiene datos pendientes de envío, descarta el siguiente estado para no acumular una cola de fotogramas viejos. El canal `control` es fiable para pausa, ping, resultado y revancha. El ping mide ida y vuelta entre jugadores; antes de recibirlo aparece “midiendo…”. La física oficial corre en el creador y el invitado predice su movimiento. No se promete un ping determinado ni se confunde una medición local con las dos casas.

El respaldo HTTPS mantiene el último estado y hasta 64 controles pendientes por jugador, con secuencias y confirmaciones. Hace un intercambio por vez, hasta diez por segundo, y renueva la sala mientras juegan. Es una vía de emergencia para dos personas, no la solución recomendada para un partido rápido.

## Salas y pestañas

El creador recibe una credencial que nunca se incluye en el enlace compartido. Se conserva en el navegador, también entre pestañas (localStorage con vigencia de 24 horas, respaldo en sessionStorage). No se traslada a otro navegador, perfil o ventana privada. Las pestañas con Web Locks evitan abrir dos conexiones simultáneas de la misma sala: muestran un aviso antes de sobrescribir la oferta. Si el navegador bloquea ambos almacenamientos, se informa el problema en lugar de perder silenciosamente el rol del creador.

El invitado tiene otra credencial. Un tercero sigue siendo rechazado. Abrir el enlace con otro navegador en la misma computadora cuenta como otro participante. Una invitación sin uso vence a los 15 minutos. Tras una recarga de una partida ya iniciada, creen una sala nueva: conservar la identidad no restaura la simulación de una partida interrumpida.

Ambos deben mantener la pestaña visible. Los partidos duran 60 segundos de juego y permiten revancha al aceptar los dos; los mensajes viejos de la partida anterior se descartan.

## Activar TURN

En la revisión del 12/09/2026, el sitio vinculado no tenía variables de entorno TURN. Esta actualización incorpora la integración, pero no crea una cuenta ni contrata un proveedor automáticamente.

Opción gestionada: [Cloudflare Realtime TURN](https://developers.cloudflare.com/realtime/turn/). Usa su red global y selecciona una ubicación mediante anycast; no garantiza una ciudad ni un ping. En el alojamiento se configuran:

- `TURN_KEY_ID`: identificador de la clave TURN.
- `TURN_KEY_API_TOKEN`: secreto de esa clave, como variable secreta del servidor.

El endpoint autenticado `/api/rooms/PIN/ice` solicita credenciales de dos horas según la [API oficial](https://developers.cloudflare.com/realtime/turn/generate-credentials/). La clave permanente nunca llega al navegador. Se incluyen STUN, TURN UDP y las alternativas TCP/TLS devueltas por el proveedor. Para sesiones de más de dos horas, creen una sala nueva; esta versión no renueva credenciales en una partida abierta. Si el proveedor falla, se conserva STUN y el respaldo HTTPS, con aviso de TURN no disponible.

Para otro proveedor o un coturn propio, `ICE_SERVERS_JSON` acepta una lista estándar con `urls`, `username` y `credential`. Se suma a los STUN predeterminados para no deshabilitar accidentalmente la conexión directa. Las credenciales ICE que usa el navegador son visibles para el jugador: usar credenciales temporales o una cuenta de relay limitada, nunca una clave administrativa. No guardar secretos en Git. El endpoint anterior `/api/config` se mantiene para clientes antiguos; nunca emite la clave permanente de Cloudflare.

## Opciones para San Francisco y Córdoba capital (Argentina)

Primero prueben una sala nueva con ambos navegadores actualizados y miren la ruta y el ping. Un valor de 1300 ms no se justifica sólo por la separación geográfica: faltan mediciones de los proveedores, congestión y del camino efectivamente elegido.

Si WebRTC directo no atraviesa los NAT, las opciones son un TURN gestionado cercano o coturn en un VPS sudamericano. Vultr ofrece ubicaciones en [São Paulo](https://blogs.vultr.com/Ol-Brasil-Vultrs-20th-Cloud-Location-is-in-So-Paulo) y [Santiago](https://blogs.vultr.com/Vultr-announces-new-cloud-data-center-location-in-Santiago-Chile). Hay que comparar desde ambas casas antes de contratar: el recorrido real puede ser distinto de la cercanía en el mapa. Coturn conserva el juego actual; un servidor autoritativo de juego por WebSocket en esa región requeriría otra implementación y alojamiento persistente.

Mover únicamente el HTML a Sudamérica no arregla el ping WebRTC. Para descartar congestión, prueben por cable, sin VPN ni descargas, y con la pestaña visible. La decisión entre conexión directa, TURN o servidor debe basarse en mediciones entre ambos jugadores.

## Publicar y verificar

Reutilizar `.openai/hosting.json`, que identifica el sitio existente. `npm run build` genera `dist`, el Worker y las migraciones D1. La migración `0002` incorpora candidatos ICE; aplicarla al publicar junto con el cliente. No alcanza un hosting de HTML estático. Las variables de producción se gestionan en Sites y no en el manifiesto.

`npm test` cubre salas y autorización con SQLite real, identidad entre pestañas, bloqueo de pestañas duplicadas, credenciales TURN con proveedor simulado, dos conexiones WebRTC reales y respaldo HTTPS con respuestas perdidas. `npm run build` verifica los tipos y prepara la publicación. El proveedor TURN real y las redes de las dos casas requieren una prueba posterior con credenciales válidas.
