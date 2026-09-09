# Cómo entender y modificar el código

## Recorrido de una partida

1. React muestra la pantalla de crear sala.
2. POST /api/rooms pide un código aleatorio al servidor.
3. El servidor crea una sala Colyseus y guarda código → identificador en memoria.
4. El enlace /play/CODIGO obtiene ese identificador y abre un WebSocket.
5. Cada navegador manda movimientos y patadas. Matter.js en el servidor simula la física.
6. Colyseus envía posiciones y marcador a ambos jugadores. Phaser dibuja y suaviza esas posiciones.

## Dónde tocar

| Archivo | Responsabilidad |
| --- | --- |
| client/src/routes/play.tsx | Texto, creación de sala y enlace para compartir. |
| client/src/connection.ts | Peticiones HTTP y dirección del servidor. |
| client/src/game/scenes/Game.ts | Teclado, estado recibido, dibujo y sonido. |
| client/src/game/objects/ | Cabezas, botines, pelota y arcos visuales. |
| client/src/game/scenes/Preloader.ts | Imágenes y sonidos cargados. |
| server/src/app.config.ts | HTTP, creación de códigos y entrega de la web compilada. |
| server/src/rooms/GameRoom.ts | Jugadores, física, permisos, patadas, goles y desconexión. |
| server/src/rooms/schema/GameState.ts | Datos que el servidor sincroniza. |
| server/src/rooms/registry.ts | Mapa temporal de códigos y salas. |
| client/vite/config.dev.mjs | Proxy para editar localmente. No se usa en producción. |

## Qué estaba mal y qué se cambió

- IP privada 192.168.0.201 fija en tres archivos: sustituida por el dominio de la página y rutas relativas.
- GET que creaba salas: ahora POST, para que consultar una dirección no cree partidas.
- PIN sin validación al entrar por identificador: ahora la sala comprueba el código.
- Ambos navegadores contaban goles y ordenaban saques: ahora lo decide exclusivamente el servidor y se bloquean goles repetidos durante la pausa.
- El teclado se procesaba dentro del bucle de todos los jugadores: ahora se envían acciones una sola vez por jugador local.
- Patadas aceptadas desde cualquier distancia: ahora tienen alcance de 75 unidades y 300 ms entre patadas.
- Saltos autorizados por el navegador: ahora el servidor verifica contacto aproximado con el suelo.
- Marcador reiniciado al entrar otro jugador: se inicializa una sola vez por sala.
- Datos todavía no recibidos producían interpolaciones con valores indefinidos: se comprueban antes de usarlos.
- Suscripción repetida al evento de carga: usa once.
- Navegación bloqueada sin diálogo de salida: se eliminó el bloqueo y se libera la conexión al cerrar la escena.
- SQLite y cron para salas efímeras: eliminados junto con el script de limpieza.
- Panel de administración expuesto sin contraseña: eliminado.
- Rutas profundas con recursos relativos: base absoluta y fallback del servidor para /play/CODIGO.
- Configuración PM2 con un proceso por núcleo: una instancia para mantener todas las salas en el mismo proceso.
- Prueba de ejemplo que esperaba un campo inexistente: reemplazada por pruebas reales.

## Números fijos que sí tienen sentido

Las coordenadas de la cancha (1024×768), tamaño de pelota, arcos y jugadores son parte del diseño original. No son direcciones de red. Se conservaron para no romper la correspondencia entre sprites y colisiones.

Para cambiar velocidad, salto, alcance o fuerza de patada, editá los manejadores move/kick de GameRoom.ts. Para cambiar los arcos o el tamaño del campo, ajustá también los objetos visuales de client/src/game/objects y game/main.ts. Para cambiar la pausa, buscá 750 en scoreGoal. Los comentarios explican los umbrales del suelo y los goles.

La simulación del cliente todavía usa Matter para la presentación, con correcciones del servidor. No hay predicción avanzada ni compensación de latencia. El tacto de las patadas se simplificó: una patada fija cercana reemplaza los tres modificadores enviados por colisiones del navegador.

## Límites y mantenimiento

Las salas viven en memoria y requieren un solo proceso. No se agregó reconexión automática, temporizador de partido, selección de personajes ni soporte táctil. El límite global es 100 salas y las vacías caducan a los 10 minutos; no hay rate limiting individual por IP.

Se ejecutó npm audit fix sin forzar cambios mayores. La revisión posterior informó 5 avisos en el cliente y 18 en el servidor; son conteos de paquetes afectados, no necesariamente fallos explotables en esta aplicación. Incluyen la familia Colyseus 0.15 y sus dependencias, React Router, Vite y herramientas de pruebas. Eliminar todos exige revisar migraciones de versión y volver a probar el protocolo; no conviene ejecutar npm audit fix --force a ciegas. Para actualizar el diagnóstico: npm audit --prefix client y npm audit --prefix server.

El código conserva la atribución del autor y los recursos gráficos/sonoros originales del repositorio.
