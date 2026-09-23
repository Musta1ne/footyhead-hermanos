# Alojamiento y conexión online

## Qué camino usa la partida

La página sigue en Sites. WebRTC usa STUN para descubrir candidatos y conectar directamente los dos navegadores. Los candidatos ICE se envían mientras aparecen (trickle ICE), sin esperar a que STUN conteste. Hay hasta 20 segundos para conectar desde que se recibe la descripción del otro jugador. Las listas de candidatos son privadas para los participantes, acumulativas y acotadas; un reintento atrasado no reemplaza una lista más nueva. Una vez conectado, el juego deja de consultar la señalización.

- **Directa:** teclas y estados viajan entre las casas. El alojamiento de la página no participa en esos paquetes.

Si la conexión directa no funciona, la partida no comienza y el juego pide crear otra sala. HTTPS sigue entregando la página y coordinando la conexión inicial.

El canal `game` no ordena ni retransmite paquetes. Si tiene datos pendientes de envío, descarta el siguiente estado para no acumular una cola de fotogramas viejos. El canal `control` es fiable para pausa, ping, resultado y revancha. El ping mide ida y vuelta entre jugadores; antes de recibirlo aparece “midiendo…”. La física oficial corre en el creador y el invitado predice su movimiento. No se promete un ping determinado ni se confunde una medición local con las dos casas.

## Salas y pestañas

El creador recibe una credencial que nunca se incluye en el enlace compartido. Se conserva en el navegador, también entre pestañas (localStorage con vigencia de 24 horas, respaldo en sessionStorage). No se traslada a otro navegador, perfil o ventana privada. Las pestañas con Web Locks evitan abrir dos conexiones simultáneas de la misma sala: muestran un aviso antes de sobrescribir la oferta. Si el navegador bloquea ambos almacenamientos, se informa el problema en lugar de perder silenciosamente el rol del creador.

El invitado tiene otra credencial. Un tercero sigue siendo rechazado. Abrir el enlace con otro navegador en la misma computadora cuenta como otro participante. Una invitación sin uso vence a los 15 minutos. Tras una recarga de una partida ya iniciada, creen una sala nueva: conservar la identidad no restaura la simulación de una partida interrumpida.

Ambos deben mantener la pestaña visible. Los partidos duran 60 segundos de juego y permiten revancha al aceptar los dos; los mensajes viejos de la partida anterior se descartan.

## Probar la conexión

Prueben una sala nueva con ambos navegadores actualizados y miren el ping. Si la demora es alta, revisen los proveedores y la congestión. Mover únicamente el HTML a una región cercana no arregla el ping WebRTC. Para descartar congestión, prueben por cable, sin VPN ni descargas, y con la pestaña visible. En redes que bloquean la conexión directa, el juego informa que no pudo conectar.

## Publicar y verificar

Reutilizar `.openai/hosting.json`, que identifica el sitio existente. `npm run build` genera `dist`, el Worker y las migraciones D1. La migración `0002` incorpora candidatos ICE; aplicarla al publicar junto con el cliente. No alcanza un hosting de HTML estático. Las variables de producción se gestionan en Sites y no en el manifiesto.

`npm test` cubre salas y autorización con SQLite real, identidad entre pestañas, bloqueo de pestañas duplicadas, dos conexiones WebRTC reales y el error cuando WebRTC falla. `npm run build` verifica los tipos y prepara la publicación. Las redes de las dos casas requieren una prueba posterior.
