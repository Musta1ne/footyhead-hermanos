# Footyhead para dos hermanos

Adaptación de [azaidi4/footyhead](https://github.com/azaidi4/footyhead). Conserva sus gráficos y se juega sin Flash, desde una computadora.

## Jugar online

Abrí https://footyhead-hermanos.grand-rook-5288.chatgpt.site

1. Elegí **Jugar con mi hermano → Crear sala**.
2. Copiá el enlace y mandáselo a tu hermano.
3. Tocá **Entrar a jugar** desde la misma pestaña donde creaste la sala. Sos el jugador izquierdo y tu navegador lleva la partida.
4. Tu hermano abre el enlace en su computadora y juega a la derecha. La partida comienza al conectarse.

Ambos usan **← y → para moverse, ↑ para saltar y Espacio para patear**. Hacé clic en el juego si las teclas no responden. No se necesita cámara ni micrófono.

Mantengan el juego visible: cambiar de pestaña pausa la partida para los dos. Si alguno cierra o recarga, creen otra sala. Las invitaciones vencen a los 15 minutos; una partida ya conectada continúa sin usar la sala del alojamiento.

El indicador muestra la ida y vuelta entre ustedes. No es el tiempo de respuesta del teclado: el movimiento se calcula localmente. No hay un ping prometido; depende de la ruta entre sus conexiones.

## Cómo se conecta

El alojamiento entrega la página e intercambia la oferta inicial de WebRTC. Después, teclas, pelota y marcador viajan entre los dos navegadores. Render y Colyseus ya no forman parte del juego.

El creador calcula la física oficial. El invitado predice su movimiento y lo ajusta a los estados confirmados. Los gráficos sólo dibujan esa simulación: no hay dos motores distintos empujando a los personajes.

Algunas redes bloquean la conexión directa y requieren TURN. Esta instalación usa STUN y no incluye un servicio TURN contratado. Si aparece ese mensaje desde sus dos casas, habrá que configurar un proveedor TURN; no se pide abrir puertos ni cambiar el router. Más detalles en [ONLINE.md](ONLINE.md).

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

También usa http://localhost:8080. Para probar dos jugadores localmente usá dos ventanas visibles; cambiar a otra pestaña pausa el juego. `localhost` de tu computadora no es un enlace que pueda abrir tu hermano desde su casa.

## Cambiar el código

Leé [CODIGO.md](CODIGO.md): indica dónde están las teclas, velocidades, física, red y pantallas.

```sh
npm test
npm run build
```

Las pruebas cubren física, goles, privacidad de las salas y dos conexiones WebRTC reales sin navegador. El ensayo local de WebRTC no equivale a probar las redes de dos casas.

## Créditos

Código y recursos de partida: [Ahmad Zaidi / azaidi4](https://github.com/azaidi4/footyhead). Adaptación para uso personal entre hermanos. Los recursos visuales originales se conservan; esta adaptación no acredita propiedad sobre ellos.
