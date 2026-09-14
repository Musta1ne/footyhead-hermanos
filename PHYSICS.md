# Física base: referencia y calibración

Referencias aportadas por el usuario: `Desktop 2026.09.13 - 13.57.43.01.mp4`
(78,48 s) y `Desktop 2026.09.13 - 18.44.43.02.mp4` (51,37 s), ambas
1920 × 1080 y 60 FPS. Juego: Sports Heads Football Championship.
No se implementaron powerups. Las medidas de movimiento y salto aprobadas
en la primera iteración se conservan.

## Medidas

La cancha del video ocupa aproximadamente x=206–1326, con el piso en y=880.
Se normalizaron las distancias a los 1024 px de ancho de este proyecto
(1120/1024 = 1,09375 píxeles del video por unidad de juego).
Se siguieron la cabeza derecha y la pelota cada dos fotogramas y se ajustaron
parábolas a tramos de vuelo sin contactos. Son estimaciones visuales, no
constantes extraídas del programa original. Los fotogramas repetidos de la
grabación, las animaciones y la compresión introducen un pequeño error.

| Magnitud | Tramo del video | Medida normalizada | Valor elegido |
| --- | --- | --- | --- |
| Gravedad de la cabeza | 15,52–16,35; 19,32–20,10; 22,94–23,78 s | 0,139–0,146 px/paso² | 0,145 |
| Altura del salto desde el piso | Mismos tres saltos | Aproximadamente 62 px | Impulso −4,3 px/paso; altura comprobada entre 58–66 px |
| Duración del salto | Mismos tres saltos | Aproximadamente 1 s | Comprobada entre 0,95–1,05 s |
| Carrera sostenida | 15,60–16,20; 23,00–23,78 s | Aproximadamente 3,70–3,73 px/paso | 3,75 |
| Inercia al soltar | 16,27–16,80 s | Aproximadamente 18 px restantes | Factor 0,82 por paso; 14–22 px de margen |
| Gravedad de la pelota | 5,80–7,35 s, primer saque | Aproximadamente 0,098 px/paso² | 0,1 |
| Velocidad horizontal del primer saque | 5,80–7,35 s | Aproximadamente 2,93 px/paso | 3 |
| Altura del saque | Pelota detenida antes de jugar | Aproximadamente y=295 | 295 |
| Impulso vertical del saque | Ascenso inicial de unos 22 px | Aproximadamente −2,1 px/paso | −2,1 |

Cada paso corresponde a 1/60 s. La pelota no tiene resistencia de aire:
mantiene la velocidad horizontal en vuelo. Los jugadores tienen una gravedad
distinta, aceleran hasta su velocidad máxima y frenan progresivamente al soltar.

## Contactos del balón y proporciones del pie

La referencia más reciente son las dos capturas aportadas por el usuario y
su descripción de colisiones círculo/círculo y círculo/AABB. Los valores son
una aproximación calibrable, no constantes verificadas del juego original.

- Bota de 16×18 unidades (antes 24×26), órbita de 23 (antes 35) y ángulo
  de reposo de 1,05 rad: queda recogida delante y debajo de la cabeza.
  Dibujo y colisión comparten el centro calculado por `bootPose`.
- Balón de masa 1, sin fricción de aire ni frenado horizontal al rodar.
  Se integra explícitamente fuera del mundo Matter, a 60 Hz con tres subpasos.
- Cabeza circular de radio 22, con masa infinita frente al balón: se separa
  sólo el balón y se aplica el impulso normal relativo con restitución 0,65.
  Los centros coincidentes tienen una normal de salida segura.
- Bota contra balón: círculo/AABB de 16×18, con resolución de caras, esquinas
  y centros interiores. El dibujo rota, la caja permanece alineada a los ejes.
- Durante los tres primeros ticks de una pulsación, el contacto da una salida
  de (±8, −5) px/paso. La bota sube en tres ticks. Mantener Espacio la deja
  levantada, pero no reinicia el impulso. Una nueva pulsación permite otro tiro.
- Fuera de esa ventana, el pie rebota con restitución 0,6 según la normal de
  contacto. Sobre una cara horizontal esto invierte vy; sobre una cara lateral
  invierte vx, evitando que el balón atraviese el costado de la bota.
- Suelo en y=590, restitución 0,6; paredes, techo y travesaños con restitución 1.
  Los travesaños conservan sus cajas inclinadas ±0,05 rad. Sólo se rebota si el
  balón se acerca; siempre se corrige la penetración. Los rebotes mínimos se
  estabilizan en el piso sin consumir velocidad horizontal.
- Límite de velocidad de 14 px/paso: el máximo desplazamiento por subpaso es
  aproximadamente 4,67 unidades, inferior al radio del balón.

## Jugadores y red

Matter sigue resolviendo el movimiento de los jugadores, sus apoyos y los
contactos entre rivales. Se conservan la carrera, la inercia y el salto medidos
arriba. Las botas levantadas bloquean al rival; recogidas no empujan la cabeza
que sirve de apoyo al caer encima de otro jugador.

La física del balón es explícita, pero esto no convierte todo el juego en un
lockstep determinista entre máquinas. Se conserva el anfitrión autoritativo,
la predicción y la restauración de snapshots. El formato de estado no cambia:
`feet`, `kicks` y los inputs restauran también la ventana activa de patada.
Ambos jugadores deben recargar la versión nueva antes de jugar juntos.

## Comprobación

`tests/simulation.test.ts` cubre salto, inercia, apoyos, goles, revancha,
restauración, alcance compacto, patadas simétricas, rodadura y pérdida de
altura. También verifica círculo/AABB con centro interior, separación sin
NaN, restitución de cabeza sin empujar al jugador y contactos a velocidad
máxima contra cabeza, bota y travesaño.

Ejecutar `npm test` y `npm run build` antes de publicar. La equivalencia de
sensaciones con el original requiere comparación jugando; las capturas no
permiten medir tiempos ni fuerzas exactas.
