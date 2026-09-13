# Física base: referencia y calibración

Referencia: video aportado por el usuario, `Desktop 2026.09.13 - 13.57.43.01.mp4`,
78,48 segundos, 1920 × 1080, 60 FPS. Juego mostrado: Sports Heads Football
Championship. No se implementaron powerups.

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

## Aspectos aproximados que conviene afinar jugando

El tramo 7,45–7,90 s muestra una salida de pelota de aproximadamente
−5,4 px/paso en horizontal y −3,6 en vertical, próxima al pie derecho. Como el
contacto ocurre junto al piso y la cabeza, no permite aislar exactamente la
contribución de cada uno. Sirve de referencia para una patada baja; no de
medición concluyente de la restitución del suelo.

La potencia base del pie (5,5; −3,6), su recorrido de 12 pasos, la recuperación
de 18 pasos, la aceleración horizontal de 0,65, las masas, el rebote y el límite
de velocidad de pelota son decisiones de calibración. La altura de contacto
y la velocidad del jugador modifican ligeramente la salida de la patada.
Los coeficientes de restitución de Matter no equivalen directamente a la
proporción de alturas de dos rebotes; se verificó la trayectoria resultante.

Los saltos elegidos ocurren antes de la primera recogida visible de un powerup.
Se excluyeron de los ajustes los tramos posteriores con cambios de tamaño,
efectos o contactos entre cuerpos que alteran la trayectoria. El video tampoco
determina con precisión el comportamiento de todas las esquinas o patadas.

## Contactos y controles

- El pie tiene una ventana de contacto y una posición compartida por el dibujo
  y la simulación. No alcanza una pelota situada detrás o lejos por encima de
  la cabeza. Una patada puede impactar una sola vez.
- Mantener Espacio repite el gesto con su recuperación. Mantener Arriba vuelve
  a saltar al aterrizar. Las pulsaciones breves siguen viajando como contadores
  para sobrevivir a la pérdida de un paquete.
- El salto requiere apoyo real bajo el personaje: piso, travesaño o rival.
  No se habilita un segundo salto en el aire.
- La simulación usa dos subpasos por paso de red y limita la pelota a
  14 px/paso para evitar cruces de superficies finas en impactos rápidos.
- `kickHits` forma parte del estado de red; restaurar una patada conserva si
  ya golpeó o todavía puede golpear. Los controles sostenidos se liberan al
  perder el foco y por el timeout de entrada remota.

## Comprobación

`tests/simulation.test.ts` comprueba los márgenes del salto y la inercia,
las dos gravedades, rebotes que pierden altura, travesaños, apoyo sobre el rival,
alcance del pie, repetición al mantener controles y restauración durante la
patada. También conserva las comprobaciones de goles, revancha y colisiones
tras restaurar estados.

Después de publicar esta versión ambos jugadores deben recargar y crear una
sala nueva: el formato de entrada y de estado incluye campos nuevos.
