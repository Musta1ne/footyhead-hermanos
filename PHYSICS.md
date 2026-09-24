# Fisica base: referencia, calibracion y limites

Referencias aportadas por el usuario: `Desktop 2026.09.13 - 13.57.43.01.mp4`
(78,48 s) y `Desktop 2026.09.13 - 18.44.43.02.mp4` (51,37 s), ambas
1920 x 1080 y 60 FPS. Juego: Sports Heads Football Championship.
Estos videos se usaron para ajustar la fisica base. Los powerups se agregaron
despues con valores propios documentados en el [issue #6](https://github.com/Musta1ne/footyhead-hermanos/issues/6); las medidas de
movimiento y salto base aprobadas en la primera iteracion se conservan.

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
distinta, aceleracion y frenado progresivo. Las botas son cuerpos dinamicos
con masa finita y una restriccion elastica al jugador: pueden ceder, rotar y
desplazarse al recibir contactos, en vez de ser cuerpos estaticos teletransportados.

## Ajuste de sensacion de la pelota y la bota

La referencia original usa restitucion 0,6, pero la geometria de 1024 px y la
salida fija de este runtime hacian que la pelota se sintiera demasiado rapida y
rebotona. Se ajustaron solo reglas compartidas por el anfitrion y la prediccion;
El estado de snapshots incluye ahora los cuerpos dinamicos de ambas botas.

La bota ya no impone una velocidad fija a la pelota: su masa, giro, velocidad y
punto de contacto determinan el impulso reciproco del solucionador de pelota.

| Regla | Valor elegido | Efecto observable |
| --- | ---: | --- |
| Saque X | 2,5 px/paso | Menor velocidad inicial horizontal |
| Saque Y | -1,8 px/paso | Saque menos vertical |
| Limite de velocidad | 10,5 px/paso | Tope contra tiros incontrolables |
| Restitucion del suelo | 0,48 | Primer rebote conserva aproximadamente 48% |
| Restitucion de cabeza | 0,4 | Contactos devuelven menos energia |
| Restitucion de bota | 0,45 | La respuesta depende tambien de su masa y velocidad |
| Restitucion de paredes/postes | 0,45 | Dejan de ser trampolines |
| Damping de la pelota | 0,998 por paso | Vuelo y rodadura conservan mejor el impulso horizontal |
| Tope tras rodar 150 ms | 2,5 px/paso | El jugador puede alcanzar una pelota rapida en el piso |

La bota tiene masa 2,4, friccion de aire 0 y un pivote de longitud cero
con resorte torsional 0,34 y amortiguacion angular 0,16. Su inercia efectiva
es `Icom + masa * radioOrbita²`. La articulacion une el cuerpo al
centro del jugador, mientras que el objetivo angular sigue la elevacion
compartida de `feet`. La respuesta queda integrada por Matter en cada subpaso,
incluidas las fuerzas y torques de los contactos; no se inyecta una velocidad
horizontal o vertical fija al patear.

El ascenso y el descenso del gesto duran 12 ticks (aproximadamente 200 ms)
cada uno; un toque detectado entre fotogramas mantiene el ascenso durante 9
ticks. La misma orbita y el mismo resorte fisico se conservan. Este ritmo queda
entre el ascenso inicial de 8 ticks y el de 16 ticks; ambos jugadores usan el
mismo gesto.

El damping se aplica en cada subpaso como `0,998^(1/3)`, equivalente a 0,998
por tick de 60 Hz. No se aplica friccion tangencial artificial en contactos:
la pelota sigue pudiendo rodar y las patadas siguen respondiendo al primer
paso.

Cuando la pelota permanece apoyada, con velocidad vertical de hasta 0,05
px/paso, el simulador acumula tiempo de rodamiento. Al completar 150 ms limita
solo la magnitud horizontal que exceda 2,5 px/paso; una pelota mas lenta nunca
se acelera. Despegar, rebotar o detenerse reinicia el contador.

## Contactos de la pelota y proporciones del pie

- La referencia usa un escenario de 800 px de ancho y este juego uno de 1024 px.
  Jugadores, botas, pelota y arcos se dibujan con el mismo factor 1,28 para
  conservar sus proporciones respecto de la cancha. Las colisiones usan el
  mismo factor, de modo que las siluetas visibles y las superficies de contacto
  no se separan.
- Bota rectangular de 20,48x23,04 unidades, masa 2,4, orbita de 34,56 y
  angulo inicial de reposo de 1,05 rad: queda recogida delante y debajo de la
  cabeza. `bootPose` solo define la referencia de la articulacion; el cuerpo
  puede separarse, rotar y corregirse por la dinamica. El dibujo usa la
  posicion y el angulo reales del cuerpo `boots`.
- Pelota de masa 1, sin friccion de aire del motor Matter. Se integra
  explicitamente fuera del mundo Matter, a 60 Hz con tres subpasos, y aplica
  el damping calibrado arriba.
- Cabeza circular de radio 28,16 y pelota de radio 12,8. La cabeza conserva
  masa infinita frente a la pelota: se separa
  solo la pelota y se aplica el impulso normal relativo con restitucion 0,4.
  Los centros coincidentes tienen una normal de salida segura.
- Bota contra pelota: rectangulo dinamico de 20,48x23,04 con restitucion 0,45.
  La restriccion de la bota al jugador conserva el barrido, y Matter resuelve
  los impulsos reciprocos consideran normal, masas, inercia y velocidad relativa.
- Las mascaras de contacto con pelota, cabeza rival y otra bota estan siempre
  activas. Al pulsar, el resorte busca el objetivo levantado. Mantener Espacio la deja
  levantada, pero no reinicia la patada; al soltar, la restriccion la devuelve
  progresivamente. No se fija una salida artificial de la pelota.
- La bota puede ceder o rotar ante pelota y rival; no colisiona con el escenario. El contacto
  continuo se conserva incluso cuando queda quieta, por lo que la pelota puede
  volver a tocarla sin una nueva pulsacion.
- Suelo en y=590, restitucion 0,48; paredes, techo y travesanos con
  restitucion 0,45. Los travesanos conservan sus cajas inclinadas +/-0,05 rad.
  Solo se rebota si la pelota se acerca; siempre se corrige la penetracion.
  Los rebotes minimos se estabilizan en el piso sin consumir velocidad
  horizontal de forma artificial.
- Las seis pendientes que delimitan los marcadores negros superiores comparten
  vertices con el dibujo del estadio y usan la restitucion de pared. Sus
  normales apuntan hacia la cancha para devolver la pelota segun cada angulo.
- Limite de velocidad de 10,5 px/paso: el maximo desplazamiento por subpaso es
  3,5 unidades, inferior al radio de la pelota.

## Jugadores y red

Matter sigue resolviendo el movimiento de jugadores, apoyos y contactos entre
rivales. Se conservan carrera, inercia y salto. Las botas mantienen contactos
con el rival incluso recogidas. Tienen masa finita, amortiguacion torsional y
un pivote fisico al jugador, asi que su estado de posicion, velocidad, angulo y giro es
parte de la dinamica observable.

En la esquina entre la pared, la cabeza y el travesaño, la pelota conserva la
cara superior de contacto durante cada subpaso. Asi, la separacion de la cabeza
no puede expulsarla por debajo del techo del arco y generar un gol desde arriba.
Un jugador apoyado sobre el travesaño se desliza hacia la cancha hasta caer,
incluso si mantiene la direccion hacia la pared. `roofSlide` viaja en cada
snapshot para que el anfitrion y el invitado continuen el mismo deslizamiento.
El travesaño no habilita un salto, incluso si se mantiene pulsada la tecla.

La fisica de la pelota es explicita, pero esto no convierte todo el juego en un
lockstep determinista entre maquinas. Se conserva el anfitrion autoritativo,
la prediccion y la restauracion de snapshots. `boots` serializa el estado
dinamico completo de cada pie (`x`, `y`, `vx`, `vy`, `angle`, `spin`); `feet`,
`kicks`, los inputs y `ballRollMs` restauran tambien la ventana activa de
patada y el tiempo continuo de rodamiento. El invitado dibuja esas posiciones y
angulos confirmados/predichos, no una orbita reconstruida desde `lift`.
Ambos jugadores deben recargar la version nueva antes de jugar juntos.

## Comprobacion

`tests/simulation.test.ts` cubre salto, inercia, apoyos, goles, revancha,
restauracion, alcance compacto, patadas simetricas, rodadura amortiguada y
perdida de altura. Tambien verifica limites de velocidad, restitucion y
damping, circulo/AABB con centro interior, separacion sin NaN, restitucion de
cabeza sin empujar al jugador y contactos a velocidad maxima contra cabeza,
bota y travesano. Las regresiones de colision comprueban ademas que bajar el
botin no arrastre la pelota detras de ninguno de los jugadores y que las seis
pendientes superiores la hagan rebotar hacia la cancha.

Ejecutar `npm test` y `npm run build` antes de publicar. La equivalencia de
sensaciones con el original requiere comparacion jugando; las capturas no
permiten medir tiempos ni fuerzas exactas.
