# Alojamiento y conexión online

## Versión actual

La página está alojada en Sites. El juego prefiere WebRTC DataChannel y usa un respaldo HTTPS cuando la conexión directa no se establece. Render ya no es una dependencia del código.

Hay dos canales entre los jugadores:

- `game`: entradas y estados frecuentes, sin ordenar ni retransmitir paquetes atrasados.
- `control`: mensajes fiables para pausa, medición de ping, resultado final y revancha.

Los partidos duran 60 segundos de juego, incluidas las pausas de gol. El reloj se pausa si alguno cambia de pestaña. Al llegar a 0:00 se congela el marcador: gana quien hizo más goles y, si están iguales, hay empate. Ambos pueden pulsar **Jugar otra vez**; cuando los dos aceptan se reinician reloj, marcador y posiciones en la misma sala y conexión. El anfitrión confirma el resultado y el nuevo partido; los paquetes atrasados del partido anterior se descartan.

Las ofertas y respuestas se guardan en D1 y sólo son accesibles por los participantes. Cuando falla ICE o pasan ocho segundos desde el intercambio sin conectar, un participante activa el respaldo en la sala y el otro lo detecta durante la negociación. El respaldo mantiene dos buzones acotados en D1, uno por jugador, con el último estado y hasta 64 mensajes fiables pendientes de confirmación. Los mensajes llevan secuencias para descartar duplicados y reintentos atrasados. Cada cliente hace un intercambio por vez, aproximadamente diez por segundo cuando la red lo permite; no acumula los estados de cada fotograma. La física sigue en el anfitrión y la predicción en el invitado.

Las salas sin actividad vencen a los 15 minutos y se limpian al crear otra. El respaldo renueva ese plazo durante el juego. Los buzones contienen datos transitorios de la partida, no un historial. Si alguno recarga, debe crear otra sala. Una partida directa ya conectada no depende del alojamiento; una partida por HTTPS sí.

## Publicar cambios

Este proyecto ya tiene su identificación en `.openai/hosting.json`. Se debe reutilizar, no crear otro sitio. La publicación incluye la carpeta `dist` generada por `npm run build`; el alojamiento aplica las migraciones de `drizzle/` y conecta la base lógica `DB`.

El Worker necesita un entorno Cloudflare Workers compatible y un binding de archivos `ASSETS`. No se puede subir solamente el HTML a un alojamiento estático: la creación de salas necesita el Worker y D1.

Para pedir una actualización basta con indicar qué querés cambiar y pedir que se publique en el mismo sitio.

## Si no conecta desde dos casas

STUN permite descubrir cómo salir de muchas redes domésticas. Algunas combinaciones de NAT o firewalls impiden WebRTC directo. El respaldo HTTPS usa el mismo origen que la página y no requiere credenciales TURN, abrir puertos ni configurar el router. Ambos deben usar la versión actualizada y una sala nueva. El indicador diferencia conexión directa y conexión por servidor.

La variable de entorno opcional `ICE_SERVERS_JSON` acepta la lista de servidores ICE estándar de WebRTC. Dejarla sin definir usa los STUN predeterminados. Para TURN se necesita un proveedor y credenciales válidas; no usar servidores de demostración ni pegar secretos en el código. Las credenciales entregadas al navegador son visibles para sus usuarios: en un servicio público conviene integrar la emisión de credenciales temporales del proveedor en `/api/config` antes de activarlo.

TURN sigue siendo una mejora opcional para conservar DataChannels en redes restrictivas. El respaldo HTTPS introduce más latencia y consumo de solicitudes/D1 que WebRTC y está pensado para este juego entre dos personas, no para muchas partidas simultáneas. No se promete un valor de ping: hay que medir entre las dos casas. Una caída del alojamiento o de internet puede interrumpir el respaldo.

Referencia técnica: https://webrtc.org/getting-started/peer-connections
