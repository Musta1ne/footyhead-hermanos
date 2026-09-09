# Alojamiento y conexión online

## Versión actual

La página está alojada en Sites y el juego usa WebRTC DataChannel. Render ya no es una dependencia del código.

Hay dos canales entre los jugadores:

- `game`: entradas y estados frecuentes, sin ordenar ni retransmitir paquetes atrasados.
- `control`: mensajes fiables para pausa, medición de ping, resultado final y revancha.

Los partidos duran 60 segundos de juego, incluidas las pausas de gol. El reloj se pausa si alguno cambia de pestaña. Al llegar a 0:00 se congela el marcador: gana quien hizo más goles y, si están iguales, hay empate. Ambos pueden pulsar **Jugar otra vez**; cuando los dos aceptan se reinician reloj, marcador y posiciones en la misma sala y conexión. El anfitrión confirma el resultado y el nuevo partido; los paquetes atrasados del partido anterior se descartan.

HTTP sólo conecta la sala inicialmente. Las ofertas y respuestas se guardan en D1, son accesibles sólo por los participantes y dejan de ser accesibles al vencer la sala. Las filas vencidas se limpian al crear otra sala. No se guarda el marcador ni el historial de partidas.

## Publicar cambios

Este proyecto ya tiene su identificación en `.openai/hosting.json`. Se debe reutilizar, no crear otro sitio. La publicación incluye la carpeta `dist` generada por `npm run build`; el alojamiento aplica las migraciones de `drizzle/` y conecta la base lógica `DB`.

El Worker necesita un entorno Cloudflare Workers compatible y un binding de archivos `ASSETS`. No se puede subir solamente el HTML a un alojamiento estático: la creación de salas necesita el Worker y D1.

Para pedir una actualización basta con indicar qué querés cambiar y pedir que se publique en el mismo sitio.

## Si no conecta desde dos casas

STUN permite descubrir cómo salir de muchas redes domésticas. Algunas combinaciones de NAT o firewalls necesitan un relay TURN. La versión actual no trae credenciales de un proveedor TURN, por lo que no garantiza conexión en esas redes.

La variable de entorno opcional `ICE_SERVERS_JSON` acepta la lista de servidores ICE estándar de WebRTC. Dejarla sin definir usa los STUN predeterminados. Para TURN se necesita un proveedor y credenciales válidas; no usar servidores de demostración ni pegar secretos en el código. Las credenciales entregadas al navegador son visibles para sus usuarios: en un servicio público conviene integrar la emisión de credenciales temporales del proveedor en `/api/config` antes de activarlo.

TURN sería sólo una alternativa cuando la conexión directa falla. La física seguiría corriendo en el navegador del creador. No se promete un valor de ping: hay que medir entre las dos casas.

Referencia técnica: https://webrtc.org/getting-started/peer-connections
