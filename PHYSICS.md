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

## Pelota y pie: segunda referencia

El segundo video conserva los 1120 px de ancho; el piso está en y=865 y el
centro de la pelota apoyada en y≈852. Entre 3,6 y 8 s se distinguen un ápice
inicial cercano a y=520 y dos rebotes con ápices cercanos a 728 y 808.
Las raíces de las proporciones de altura dan restituciones de aproximadamente
0,61 y 0,60. La simulación usa **0,6** y comprueba la velocidad de salida real.

Entre 34 y 39,5 s la pelota rueda sin contactos a unos −19,89 px/s de video,
equivalentes a −0,303 px/paso. Se elimina el frenado por fricción del balón.
También se separa su giro visual (`ballRotation`) de la orientación del cuerpo
de colisión: el torque del polígono de Matter ya no consume parte del rebote.
La gravedad sigue siendo 0,1 px/paso² y la masa sigue siendo 3.

Entre 32 y 39 s se observa el pie derecho quieto arriba mientras se mantiene P,
y su retorno al soltar. El centro levantado está aproximadamente 35 unidades
delante de la cabeza; en reposo está detrás y debajo. Se usa una órbita de
radio 35, desde 2,02 rad hasta 0, con ascenso y descenso de 8 pasos cada uno.
La bota pasa de 18×19 a 24×26 unidades y su colisión es un círculo de radio 11.

El pie es un cuerpo cinemático unido a la cabeza. Colisiona continuamente con
la pelota, la cabeza y el pie rival, incluso cuando está quieto. El contacto
entre las dos botas separa a sus dueños porque Matter no resuelve pares de
cuerpos estáticos. Su grupo excluye a su
propia cabeza y su máscara excluye el suelo, para no cambiar la altura de apoyo
ni el salto que el usuario aprobó. La velocidad de la cabeza más el 55 % del
barrido alimentan el contacto. El motor resuelve la dirección según la normal,
la velocidad relativa y las masas; no se fija una salida (vx, vy) al pulsar.

## Aspectos aproximados que conviene afinar jugando

El tramo 7,45–7,90 s muestra una salida de pelota de aproximadamente
−5,4 px/paso en horizontal y −3,6 en vertical, próxima al pie derecho. Como el
contacto ocurre junto al piso y la cabeza, no permite aislar exactamente la
contribución de cada uno. Sirve de referencia para una patada baja; no de
medición concluyente de la restitución del suelo.

El factor de transferencia del barrido, los 8 pasos de subida/bajada, la
aproximación circular de la bota y el límite de velocidad son decisiones de
calibración. No se dispone de las constantes del programa original.

Los saltos elegidos ocurren antes de la primera recogida visible de un powerup.
Se excluyeron de los ajustes los tramos posteriores con cambios de tamaño,
efectos o contactos entre cuerpos que alteran la trayectoria. El video tampoco
determina con precisión el comportamiento de todas las esquinas o patadas.

## Contactos y controles

- Mantener Espacio mantiene el pie arriba; soltarlo lo baja. La posición
  compartida por dibujo y simulación es `bootPose(team, lift)`. Una pelota que
  vuelve puede volver a chocar con el pie sin una nueva pulsación. No hay
  temporizador que repita golpes ni un impulso extra al sostener la tecla.
- Mantener Arriba vuelve a saltar al aterrizar. Las pulsaciones breves siguen
  viajando como contadores para sobrevivir a un paquete perdido. Si un toque
  entero ocurrió entre fotogramas, `tapTicks` conserva un barrido breve.
- El salto requiere apoyo real bajo el personaje: piso, travesaño o rival.
  No se habilita un segundo salto en el aire.
- La simulación usa dos subpasos por paso de red y limita la pelota a
  14 px/paso para evitar cruces de superficies finas en impactos rápidos.
- `feet` guarda la elevación y los ticks del toque breve para restaurar el
  movimiento a mitad del barrido. `ballRotation` sincroniza el giro visual.
  Los controles sostenidos se liberan al perder el foco y por timeout remoto.

## Comprobación

`tests/simulation.test.ts` comprueba los márgenes del salto y la inercia,
las dos gravedades, rebotes que pierden altura, travesaños, apoyo sobre el rival,
órbita y retorno del pie, bloqueo del rival, rebote contra el pie sostenido,
rodadura, simetría de ambos lados y restauración durante el barrido.
También conserva las comprobaciones de goles, revancha y colisiones tras
restaurar estados. Los tres casos nuevos de pie sostenido, bloqueo del rival
y rodadura fallaban en la versión anterior y pasan con esta implementación.

Después de publicar esta versión ambos jugadores deben recargar y crear una
sala nueva: el formato de entrada y de estado incluye campos nuevos.
