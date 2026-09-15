# Mapa del código

## Los archivos principales

| Archivo | Qué cambiar ahí |
| --- | --- |
| `client/src/game/simulation.ts` | Reglas, velocidades, tamaño del campo, salto, patadas y goles. `RULES` agrupa las constantes de jugabilidad. |
| `client/src/game/visual-proportions.ts` | Escala compartida de jugadores, botas, pelota y arcos respecto de la referencia de 800 px. |
| `client/src/game/scenes/Game.ts` | Flechas/Espacio, dibujo de los personajes, marcador, predicción y correcciones del invitado. |
| `client/src/game/scenes/stadium.ts` | Tribunas, césped, arcos y decoración arcade; no modifica la física. |
| `client/src/routes/game.tsx` y `client/src/layout/game.css` | Marco adaptable de la partida, botón de sonido y regreso al menú. |
| `client/src/game/peer.ts` | Conectar los dos navegadores, medir ping, detectar desconexión y enviar paquetes. |
| `client/src/game/relay.ts` | Respaldo HTTPS: último estado, mensajes fiables, confirmaciones y reintentos. |
| `worker/index.ts` | API de salas, configuración ICE y entrega de la página. No ejecuta física. |
| `worker/rooms.ts` | Consultas a las salas temporales. |
| `db/schema.ts` | Estructura de esa base; `drizzle/` contiene sus migraciones. |
| `client/src/routes/home.tsx` | Menú principal. |
| `client/src/routes/play.tsx` | Crear sala y copiar enlace. |
| `client/src/layout/MenuShell.tsx` y `menu.css` | Estadio, título y botones del menú y la sala; estilos aislados de la partida. |
| `client/public/assets/` | Imágenes y sonidos originales. |

## Un fotograma de la partida

1. Se leen las teclas. `direction` vale -1, 0 o 1. Los contadores `jump` y `kick` aumentan una vez por pulsación.
2. El anfitrión ejecuta `Simulation.step` a 60 pasos por segundo con su entrada y la última entrada recibida del invitado.
3. Cada dos pasos manda un estado completo. El canal no reintenta estados viejos: uno nuevo reemplaza al anterior.
4. El invitado también simula inmediatamente. Al recibir un estado, restaura la física y vuelve a ejecutar las entradas que el anfitrión todavía no confirmó.
5. Los sprites suavizan las correcciones pequeñas. El marcador mostrado por el invitado siempre viene del anfitrión.

Cada entrada tiene `seq`. Se ignoran entradas y estados anteriores a los ya recibidos. Los contadores de salto/patada sobreviven a un paquete perdido y evitan repetir la acción cuando llega el siguiente.

`jumpHeld` vuelve a saltar al aterrizar y `kickHeld` mantiene el pie levantado
hasta soltar la tecla. `feet` guarda la elevación y el toque breve de cada pie;
sus cuerpos cinemáticos se reconstruyen al restaurar la predicción. Dibujo y
contacto comparten `bootPose(team, lift)`. `ballRotation` es el giro visual del
balón, separado de su colisión. `ballRollMs` conserva el tiempo que lleva
rodando apoyado y permite aplicar el tope horizontal después de 500 ms sin que
una corrección de red reinicie el contador. Las medidas y aproximaciones están en
[PHYSICS.md](PHYSICS.md).

## Qué era hardcodeado y qué sigue siendo una regla

Se eliminaron la dirección de Render, la conexión a Colyseus y la física del servidor. La API usa el origen de la página, de modo que no hay una URL diferente escondida en el cliente.

El campo usa 1024×768 unidades. Los objetos de la referencia de 800 px se escalan por 1,28 para conservar sus proporciones, y sus colisiones acompañan el dibujo. La velocidad y los tiempos son parámetros del juego, no datos de infraestructura. Están en `simulation.ts` para poder cambiarlos sin recorrer servidor y cliente.

Los servidores STUN predeterminados están en `/api/config` del Worker. Se pueden reemplazar mediante `ICE_SERVERS_JSON` en el alojamiento. No agregar contraseñas al repositorio.

## Límites elegidos para mantenerlo simple

La sala tiene dos lugares; no hay espectadores, cuentas, reconexión ni cambio de anfitrión. Recargar requiere una sala nueva. El creador debe mantener el navegador abierto y visible. Es un juego entre personas de confianza, no un sistema competitivo con protección contra trampas.

La predicción reduce la espera del teclado, pero no elimina la latencia física de internet ni todas las correcciones de la pelota al chocar. En redes restrictivas el respaldo HTTPS evita exigir TURN, a costa de más latencia y solicitudes al alojamiento.
