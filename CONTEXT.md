# Footyhead

Juego de fútbol arcade para dos personas en una sala privada. Cada sala reúne a un anfitrión y un invitado para disputar partidas y, si ambos quieren, jugar revanchas.

## Lenguaje

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
Encuentro entre los dos jugadores de una sala, con un tiempo de juego y un marcador propios. Termina cuando se agota el tiempo; puede acabar en victoria o empate.
_Evitar_: sala, ronda.

**Gol**:
Punto que recibe un jugador cuando el balón entra en el arco de su rival. Después de un gol, el juego se reanuda con un saque.

**Saque**:
Reanudación del juego con ambos jugadores y el balón en sus posiciones iniciales, al comenzar una partida o después de un gol.

**Marcador**:
Cantidad de goles de cada jugador durante una partida. Comienza en cero en cada partida.

**Revancha**:
Nueva partida en la misma sala después de que termina la anterior y ambos jugadores aceptan volver a jugar.
