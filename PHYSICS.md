# Física base: original, calibración y límites

Esta nota separa la evidencia extraída del SWF original de las decisiones de
calibración del runtime actual. La simulación conserva el protocolo de
snapshots y el movimiento de los jugadores; el cambio de esta iteración está
concentrado en la velocidad, el rebote y la fricción del balón.

## Material original consultado

El clon de solo lectura es `C:/Users/aguma/orca/assets-footy-head-reference`.
Los archivos relevantes consultados son:

- `physics/parameters.json`: parámetros normalizados del mundo Box2D, la
  pelota y la mezcla de contactos.
- `physics/README.md`: mapa de extracción y resumen de la física de la pelota.
- `physics/EFFECTS.md`: orden de actualización, reconstrucción de la pelota y
  efectos que no forman parte de esta implementación.
- `physics/decompiled/scripts/SPL_dist1_fla/MainTimeline.as`: mundo en
  `resetWorld()` (líneas 616-628), geometría y creación inicial del balón
  (1578-1605), tres llamadas a `m_world.Step` (1484-1486), `updateBall()`
  (1867-1890), empuje de los detectores superiores (1450-1456) y listener de
  contactos (2439-2512).
- `physics/decompiled/scripts/Box2D/B2DManager.as`: construcción de círculos y
  cajas y asignación de densidad, fricción, restitución y grupos (25-45,
  48-69, 71-113).
- `physics/decompiled/scripts/Box2D/Common/b2Settings.as`: mezcla de fricción
  por raíz cuadrada (55-58), restitución por máximo (60-63) y umbral de
  velocidad `1` (28).
- `physics/decompiled/scripts/Box2D/Dynamics/Contacts/b2ContactSolver.as`:
  aplicación de la mezcla y del umbral de restitución (107-113, 175-189) y
  resolución de impulsos normales/tangenciales (379-419).
- `physics/decompiled/scripts/Ball.as`: solo la representación visual del
  balón; no contiene constantes físicas.

La extracción se hizo con JPEXS a partir de `original-game.swf`. El README del
clon identifica como origen público el paquete de Sports Heads Football
Championship y advierte que extraer el SWF no concede derechos de reutilización.

## Valores literales del original

El mundo original mide 800×540, usa gravedad `(0, 300)`, sleeping y Box2DAS
2.0.2. Cada frame visual de 30 FPS ejecuta tres pasos de `1/96 s`, por lo que
el tiempo simulado por frame es `3/96 = 1/32 s` (la escala indicada por el
clon es 0,9375 s simulados por segundo real).

La creación inicial en `MainTimeline.as:1603-1605` es:

| Magnitud | Valor original |
| --- | ---: |
| Posición del centro | `(400, 230)` |
| Radio | `10` |
| Densidad | `1,5` |
| Fricción | `1` |
| Restitución | `0,6` |
| Velocidad X | aleatoria en `[-150, 150)` |
| Velocidad Y | `-100` |
| Damping lineal/angular | `0 / 0` |
| Rotación fija | no |

No hay un límite artificial de velocidad en el código original. El balón
normal se reconstruye con `updateBall()` usando radio `5 + PUSize*5`, densidad
`0,6`, fricción `1` y restitución `0,3 + PUBouncy*0,3`, conservando posición,
velocidad lineal y velocidad angular. Esta aplicación no implementa
power-ups, así que la pelota normal permanece en el estado de radio 10 y
restitución 0,6.

El mezclado de Box2D confirma:

- suelo, paredes y postes: fricción efectiva `sqrt(1*0,5) ≈ 0,7071` y
  restitución efectiva `max(0,6, 0) = 0,6`;
- cabeza: fricción efectiva `sqrt(1*0) = 0` y restitución efectiva
  `max(0,6, 0,01) = 0,6`;
- raqueta/pie: fricción efectiva `sqrt(1*0,5) ≈ 0,7071` y restitución
  efectiva `max(0,6, 1) = 1`.

La restitución solo se agrega cuando la velocidad normal relativa supera
`b2_velocityThreshold = 1`; los contactos más lentos eliminan la aproximación
sin crear un rebote sostenido. El movimiento de la raqueta y la restitución
del contacto generan el golpe: `CollisionHappened()` registra el último
remitente y reproduce efectos, pero no fija una salida `(vx, vy)` para la
pelota. El único cambio directo adicional es `AddToLinearVelocity(±2, 0)`
cuando el sprite solapa el detector superior de un arco (1450-1456).

## Calibración del runtime actual

El runtime usa 1024 unidades de ancho y 60 ticks por segundo. Para conservar
la escala del campo se usa `S = 1024/800 = 1,28`. Dos ticks del runtime
corresponden a un frame visual original, por lo que el tiempo de referencia
por tick es:

```text
t_tick = (3 * 1/96) / (60/30) = 1/64 s
velocidad_runtime = velocidad_original * S * t_tick
aceleracion_runtime = aceleracion_original * S * t_tick²
```

Así, `simulation.ts` obtiene estos valores, sin redondearlos:

| Regla | Cálculo | Valor runtime |
| --- | --- | ---: |
| Gravedad del balón | `300*1,28/64²` | `0,09375` px/tick² |
| Saque X determinista | `150*1,28/64` | `3` px/tick |
| Saque Y | `-100*1,28/64` | `-2` px/tick |
| Umbral de restitución | `1*1,28/64` | `0,02` px/tick |
| Restitución del balón | literal | `0,6` |
| Fricción del balón | literal | `1` |
| Fricción de superficies | literal | `0,5` |
| Restitución del mundo | literal | `0` (la efectiva es `0,6`) |
| Restitución efectiva de cabeza | `max(0,6; 0,01)` | `0,6` |
| Restitución efectiva de pie | `max(0,6; 1)` | `1` |

El SWF elige `vx` inicial al azar. El juego de este repositorio conserva un
saque determinista y alternado (`±3`) para que anfitrión y predicción puedan
reproducir el mismo estado sin añadir aleatoriedad al protocolo. El radio
visual actual es 12 (el radio literal escalado sería 12,8); se conserva ese
valor ya calibrado para el sprite y la cancha del proyecto. La masa del cuerpo
Matter es un contenedor normalizado: la resolución manual usa la proporción
del momento de inercia de un círculo (`I = m*r²/2`) y sí conserva `spin` en el
snapshot.

La pelota se integra explícitamente fuera de Matter, con tres subpasos por
tick. Cada contacto corrige penetración, usa velocidad relativa de la cabeza o
del pie, aplica la restitución efectiva y limita el impulso tangencial con la
fricción mezclada. No se impone un `maxBallSpeed`: el original tampoco lo
hace, y tres subpasos mantienen el desplazamiento normal dentro de un radio
para las velocidades habituales del juego.

El pie actual sigue siendo una aproximación cinemática compacta calibrada en
la versión anterior: su órbita, dimensiones y transferencia de movimiento no
se presentan como constantes verificadas del SWF. La salida del balón ya no se
fija al pulsar; depende de la velocidad del pie y del contacto, como en el
original. El empuje especial de los detectores superiores no se replica porque
los detectores del SWF y la geometría de arco del runtime no son el mismo
objeto; queda señalado para una futura calibración de goles, no se inventa una
constante equivalente.

## Evidencia de pruebas

`tests/simulation.test.ts` verifica:

- conversión de gravedad, velocidades de saque y umbral desde los parámetros
  Box2D originales;
- restitución efectiva de cabeza, pérdida de altura en rebotes libres y
  ausencia de atravesamiento a velocidad alta;
- fricción mezclada con el suelo: la pelota conserva parte de la rodadura y
  adquiere spin, sin frenar durante el vuelo;
- golpe dependiente de la velocidad de la bota, con simetría entre lados y
  distinta salida para alturas de contacto distintas;
- restauración de snapshots durante el contacto, además de movimiento de
  jugadores, goles, revancha y apoyos ya cubiertos.

Los valores originales son evidencia del programa descompilado. La equivalencia
de sensaciones visuales todavía tiene límites: la cancha del runtime tiene otra
geometría, los pies no son la raqueta dinámica unida por junta del SWF, la
aleatoriedad inicial se reemplaza por saque determinista y no se implementan
power-ups ni el detector especial superior. Las capturas de video anteriores
son útiles como calibración visual del jugador, pero no sustituyen estas
constantes ni permiten inferir fuerzas exactas donde el SWF ya está disponible.

Ejecutar `npm test` y `npm run typecheck` antes de publicar.
