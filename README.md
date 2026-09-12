# Footyhead

Adaptación de [azaidi4/footyhead](https://github.com/azaidi4/footyhead). Conserva sus gráficos y se juega sin Flash, desde una computadora.

## Jugar online

Abrí [Footy Head online](https://footyhead-hermanos.elbarrilfumanchero.chatgpt.site).

1. Elegí **Jugar online · 2 jugadores → Crear sala**.
2. Copiá el enlace y compartilo con otra persona.
3. Tocá **Entrar a jugar** con el mismo navegador donde creaste la sala. Sos el jugador izquierdo y tu navegador lleva la partida. Se conserva tu lugar aunque abras el enlace en otra pestaña; sólo puede haber una pestaña activa de esa sala.
4. La persona invitada abre el enlace en su computadora y juega a la derecha. La partida comienza al conectarse.

Ambos usan **← y → para moverse, ↑ para saltar y Espacio para patear**. Hacé clic en el juego si las teclas no responden. No se necesita cámara ni micrófono.

Mantengan el juego visible: cambiar de pestaña pausa la partida para los dos. Si alguno cierra o recarga, creen otra sala. Las invitaciones sin uso vencen a los 15 minutos; las partidas por servidor mantienen su sala activa mientras juegan.

El indicador muestra la ida y vuelta entre ustedes. No es el tiempo de respuesta del teclado: el movimiento se calcula localmente. No hay un ping prometido; depende de la ruta entre sus conexiones.

## Cómo se conecta

El alojamiento entrega la página e intercambia la oferta inicial de WebRTC. Si la conexión directa funciona, teclas, pelota y marcador viajan entre los dos navegadores. Si no conecta, el juego cambia automáticamente a un respaldo HTTPS por el mismo alojamiento. Render y Colyseus ya no forman parte del juego.

El creador calcula la física oficial. El invitado predice su movimiento y lo ajusta a los estados confirmados. Los gráficos sólo dibujan esa simulación: no hay dos motores distintos empujando a los personajes.

La conexión directa no necesita contratar TURN. En redes restrictivas, un TURN cercano permite conservar WebRTC; sin uno disponible verán **Conexión por servidor**, el respaldo HTTPS que puede tener mucha demora. El juego avisa si falta TURN. Cambiar sólo el alojamiento de la página no reduce el ping de una partida WebRTC. Después de actualizar, ambos deben recargar y crear una sala nueva. Más detalles y opciones para Argentina en [ONLINE.md](ONLINE.md).

## Ejecutar en tu computadora

Necesitás Node.js 22 o superior y npm. En Windows usá `npm.cmd` si PowerShell bloquea `npm.ps1`.

```sh
npm run setup
npm run build
npm start
```

Abrí http://localhost:8080. Para editar con actualización automática:

```sh
npm run dev
```

También usa http://localhost:8080. Para probar dos jugadores localmente usá dos ventanas visibles; cambiar a otra pestaña pausa el juego. `localhost` de tu computadora no es un enlace que pueda abrir otra persona desde otra computadora.

## Cambiar el código

Leé [CODIGO.md](CODIGO.md): indica dónde están las teclas, velocidades, física, red y pantallas.

```sh
npm test
npm run build
```

Las pruebas cubren física, goles, privacidad de las salas, dos conexiones WebRTC reales y el respaldo HTTPS con WebRTC bloqueado y respuestas perdidas. Los ensayos locales no equivalen a medir las redes de dos casas.

## Créditos

Código y recursos de partida: [Ahmad Zaidi / azaidi4](https://github.com/azaidi4/footyhead). Adaptación para partidas multijugador online de dos personas. Los recursos visuales originales se conservan; esta adaptación no acredita propiedad sobre ellos.

