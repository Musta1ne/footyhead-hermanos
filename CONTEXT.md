# Footyhead

Juego de fútbol arcade para dos personas en una sala privada. Cada sala reúne a un anfitrión y un invitado para disputar partidas y, si ambos quieren, jugar revanchas.

## Lenguaje

**Pelota**:
Objeto con el que juegan ambos jugadores y que debe entrar en el arco rival para marcar un gol.
_Evitar_: balón.

**Sala**:
Espacio privado y temporal con dos lugares: uno para el anfitrión y otro para el invitado. Una misma sala puede contener más de una partida si ambos aceptan una revancha.

**Código de sala**:
Identificador que distingue una sala y aparece en el enlace compartido con el invitado. Conocerlo no convierte a alguien en el anfitrión.

**Anfitrión**:
Jugador que crea la sala y ocupa el lado izquierdo de la cancha.
_Evitar_: host.

**Invitado**:
Jugador que entra a una sala creada por otra persona y ocupa el lado derecho de la cancha.
_Evitar_: guest.

**Partida**:
Encuentro entre los dos jugadores de una sala, con un marcador y un modo de juego propios. Según el modo, puede terminar con un ganador o continuar indefinidamente.
_Evitar_: sala, ronda.

**Modo de juego**:
Regla que el anfitrión elige al crear la sala y que determina cómo se juega y cuándo termina cada partida. La elección se mantiene durante las revanchas de esa sala.

**Gol de oro**:
Gol que decide una partida con tiempo cuando el marcador está empatado al agotarse el reloj. Lo gana quien lo marca.

**Gol**:
Punto que recibe un jugador cuando la pelota entra en el arco de su rival. Si la partida continúa, después del gol se reanuda con un saque.

**Saque**:
Reanudación del juego con ambos jugadores y la pelota en sus posiciones iniciales, al comenzar una partida o después de un gol.

**Marcador**:
Cantidad de goles de cada jugador durante una partida. Comienza en cero en cada partida.

**Revancha**:
Nueva partida en la misma sala después de que termina la anterior y ambos jugadores aceptan volver a jugar.
