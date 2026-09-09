# Footy Head — adaptacion

Adaptación de [azaidi4/footyhead](https://github.com/azaidi4/footyhead).
Conserva los gráficos y la base del juego del repositorio original. Se juega en un navegador de computadora, sin Flash.

## Probarlo en tu computadora

Necesitás Node.js 22 o superior, con npm. Abrí una terminal dentro de esta carpeta (la que contiene este README y package.json).

```sh
npm run setup
npm run build
npm start
```

Abrí http://localhost:2567. Tocá **Jugar con mi hermano → Crear sala → Entrar a jugar**.
Abrí el enlace de la sala en otra ventana para probar los dos jugadores.

En PowerShell, si `npm` da un error de scripts o de npm-cli.js, usá `npm.cmd` en su lugar. No hace falta cambiar la política de seguridad de Windows.

**localhost sólo funciona en tu computadora.** Para jugar desde casas distintas, seguí [ONLINE.md](ONLINE.md).

## Controles y reglas

- **← / →**: moverse a izquierda / derecha.
- **↑**: saltar desde el suelo.
- **Espacio**: patear (hay que estar cerca de la pelota).
- El primero que entra juega a la izquierda; el segundo, a la derecha.
- La pelota empieza a moverse cuando entran los dos.
- Después de un gol hay una pausa de 750 ms y un nuevo saque.
- La partida no tiene límite de tiempo ni de goles.
- Si alguno se desconecta o recarga, se cierra la sala. Creen otra para volver a jugar.
- Una sala sin jugadores caduca a los 10 minutos. Reiniciar el servidor cierra todas las salas.

## Editar el código

```sh
npm run dev
```

Abrí http://localhost:8080. Los cambios se recargan automáticamente. En desarrollo el servidor usa el puerto 2567; dejalo así para que coincida con el proxy de Vite. Para probar la versión compilada, detené el modo desarrollo con Ctrl+C y usá `npm run build` y `npm start`.

Leé [CODIGO.md](CODIGO.md) para saber qué archivo tocar y qué cambió. Para ejecutar las pruebas:

```sh
npm test
```

## Estado de la adaptación

Compilación del cliente y servidor y revisión TypeScript verificadas. Cinco pruebas de integración con WebSockets: dos jugadores, tercer jugador rechazado, PIN incorrecto, gol sincronizado, control de patadas/movimiento y ciclo del enlace HTTP. También se verificó la cancha con dos pestañas del navegador.

La prueba desde dos casas y la latencia de un alojamiento público todavía deben verificarse después de publicarlo. Esta copia no está publicada en internet.

Se actualizaron dependencias dentro de sus versiones compatibles. Quedan avisos de `npm audit` heredados (ver CODIGO.md); no se considera una auditoría de seguridad completa.
