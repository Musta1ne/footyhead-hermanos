import { Link } from "react-router-dom";
import { MenuShell } from "../layout/MenuShell";

export default function Home() {
  return (
    <MenuShell>
      <section className="arcade-home" aria-label="Menú principal">
        <p className="arcade-eyebrow">DOS JUGADORES. UNA CANCHA.</p>
        <h2>El clásico entre hermanos</h2>
        <Link className="arcade-button arcade-button--large" to="/play">Jugar online</Link>
        <p className="arcade-caption">Creá una sala, invitá a tu rival y salí a la cancha.</p>
        <div className="arcade-matchup" aria-hidden="true">
          <img src="/assets/images/104.png" alt="" /><span>VS</span><img src="/assets/images/112.png" alt="" />
        </div>
        <div className="arcade-ticket">1 VS 1 <span>•</span> ONLINE <span>•</span> ENTRE AMIGOS</div>
      </section>
    </MenuShell>
  );
}
