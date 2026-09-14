# Fisica base: referencia, calibracion y limites

Referencias aportadas por el usuario: `Desktop 2026.09.13 - 13.57.43.01.mp4`
(78,48 s) y `Desktop 2026.09.13 - 18.44.43.02.mp4` (51,37 s), ambas
1920 x 1080 y 60 FPS. Juego: Sports Heads Football Championship.
No se implementaron powerups. Las medidas de movimiento y salto aprobadas
en la primera iteracion se conservan.

## Datos originales consultados

Se inspecciono el clon publico de solo lectura
[`GinoNovello/assets-footy-head`](https://github.com/GinoNovello/assets-footy-head),
en particular `physics/parameters.json`, `physics/README.md`,
`physics/EFFECTS.md` y el codigo descompilado de
`physics/decompiled/scripts/SPL_dist1_fla/MainTimeline.as` y
`physics/decompiled/scripts/Box2D/`. El material identifica Box2DAS 2.0.2,
30 FPS, tres subpasos de `1/96 s`, pelota normal de radio 10, friccion 1 y
restitucion 0,6; tambien confirma que el juego original no aplica damping
lineal. Esos datos son provenance de referencia, no assets reutilizados: esta
iteracion no importa archivos del clon porque el cambio es de fisica y los
assets existentes ya son suficientes.

## Medidas del runtime y del video

La cancha del video ocupa aproximadamente x=206-1326, con el piso en y=880.
Se normalizaron las distancias a los 1024 px de ancho de este proyecto
(1120/1024 = 1,09375 pixeles del video por unidad de juego). Se siguieron la
cabeza derecha y la pelota cada dos fotogramas y se ajustaron parabolas a
tramos de vuelo sin contactos. Son estimaciones visuales, no constantes
extraidas del programa original.

| Magnitud | Medida normalizada | Valor elegido |
| --- | --- | --- |
| Gravedad de la cabeza | 0,139-0,146 px/paso2 | 0,145 |
| Altura del salto | aproximadamente 62 px | impulso -4,3 px/paso |
| Duracion del salto | aproximadamente 1 s | 0,95-1,05 s |
| Carrera sostenida | 3,70-3,73 px/paso | 3,75 |
| Inercia al soltar | aproximadamente 18 px | factor 0,82 por paso |
| Gravedad de la pelota | aproximadamente 0,098 px/paso2 | 0,1 |
| Saque horizontal previo | aproximadamente 2,93 px/paso | 3 |
| Altura del saque | aproximadamente y=295 | 295 |
| Impulso vertical previo | aproximadamente -2,1 px/paso | -2,1 |

Cada paso corresponde a 1/60 s. La pelota aplica ahora damping suave y
determinista para que sea mas legible; los jugadores conservan su gravedad
distinta, aceleracion y frenado progresivo.

## Ajuste de sensacion del balon

La referencia original usa restitucion 0,6, pero la geometria de 1024 px y la
salida fija de este runtime hacian que el balon se sintiera demasiado rapido y
reboton. Se ajustaron solo reglas compartidas por el anfitrion y la prediccion;
el formato de snapshots no cambia.

| Regla | Antes | Despues | Efecto observable |
| --- | ---: | ---: | --- |
| Saque X | 3 px/paso | 2,5 px/paso | Menor velocidad inicial horizontal |
| Saque Y | -2,1 px/paso | -1,8 px/paso | Saque menos vertical |
| Salida X de patada | 8 px/paso | 6 px/paso | Patada inmediata, con menor alcance |
| Salida Y de patada | -5 px/paso | -4 px/paso | Arco de patada mas bajo |
| Limite de velocidad | 14 px/paso | 10,5 px/paso | Tope contra tiros incontrolables |
| Restitucion del suelo | 0,6 | 0,35 | Primer rebote conserva aproximadamente 35% |
| Restitucion de cabeza | 0,65 | 0,4 | Contactos devuelven menos energia |
| Restitucion de bota | 0,6 | 0,45 | Pie levantado bloquea sin catapultar |
| Restitucion de paredes/postes | 1 | 0,45 | Dejan de ser trampolines |
| Damping del balon | ninguno | 0,996 por paso | Vuelo y rodadura pierden velocidad gradualmente |

El damping se aplica en cada subpaso como `0,996^(1/3)`, equivalente a 0,996
por tick de 60 Hz. No se aplica friccion tangencial artificial en contactos:
la pelota sigue pudiendo rodar y las patadas siguen respondiendo al primer
paso.

## Contactos del balon y proporciones del pie

- Bota de 16x18 unidades, orbita de 23 y angulo de reposo de 1,05 rad: queda
  recogida delante y debajo de la cabeza. Dibujo y colision comparten el
  centro calculado por `bootPose`.
- Balon de masa 1, sin friccion de aire del motor Matter. Se integra
  explicitamente fuera del mundo Matter, a 60 Hz con tres subpasos, y aplica
  el damping calibrado arriba.
- Cabeza circular de radio 22, con masa infinita frente al balon: se separa
  solo el balon y se aplica el impulso normal relativo con restitucion 0,4.
  Los centros coincidentes tienen una normal de salida segura.
- Bota contra balon: circulo/AABB de 16x18, con resolucion de caras, esquinas
  y centros interiores. El dibujo rota, la caja permanece alineada a ejes.
- Durante los tres primeros ticks de una pulsacion, el contacto da una salida
  de (+/-6, -4) px/paso. La bota sube en tres ticks. Mantener Espacio la deja
  levantada, pero no reinicia el impulso. Una nueva pulsacion permite otro tiro.
- Fuera de esa ventana, el pie rebota con restitucion 0,45 segun la normal de
  contacto. Sobre una cara horizontal invierte vy; sobre una cara lateral
  invierte vx, evitando que el balon atraviese el costado de la bota.
- Suelo en y=590, restitucion 0,35; paredes, techo y travesanos con
  restitucion 0,45. Los travesanos conservan sus cajas inclinadas +/-0,05 rad.
  Solo se rebota si el balon se acerca; siempre se corrige la penetracion.
  Los rebotes minimos se estabilizan en el piso sin consumir velocidad
  horizontal de forma artificial.
- Limite de velocidad de 10,5 px/paso: el maximo desplazamiento por subpaso es
  3,5 unidades, inferior al radio del balon.

## Jugadores y red

Matter sigue resolviendo el movimiento de jugadores, apoyos y contactos entre
rivales. Se conservan carrera, inercia y salto. Las botas levantadas bloquean
al rival; recogidas no empujan la cabeza que sirve de apoyo al caer encima de
otro jugador.

La fisica del balon es explicita, pero esto no convierte todo el juego en un
lockstep determinista entre maquinas. Se conserva el anfitrion autoritativo,
la prediccion y la restauracion de snapshots. El formato de estado no cambia:
`feet`, `kicks` y los inputs restauran tambien la ventana activa de patada.
Ambos jugadores deben recargar la version nueva antes de jugar juntos.

## Comprobacion

`tests/simulation.test.ts` cubre salto, inercia, apoyos, goles, revancha,
restauracion, alcance compacto, patadas simetricas, rodadura amortiguada y
perdida de altura. Tambien verifica limites de velocidad, restitucion y
damping, circulo/AABB con centro interior, separacion sin NaN, restitucion de
cabeza sin empujar al jugador y contactos a velocidad maxima contra cabeza,
bota y travesano.

Ejecutar `npm test` y `npm run build` antes de publicar. La equivalencia de
sensaciones con el original requiere comparacion jugando; las capturas no
permiten medir tiempos ni fuerzas exactas.
