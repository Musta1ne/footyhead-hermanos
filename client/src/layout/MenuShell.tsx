import { PropsWithChildren } from "react";
import "./menu.css";

export function MenuShell({ children }: PropsWithChildren) {
  return (
    <main className="arcade-menu">
      <div className="arcade-stadium" aria-hidden="true">
        <div className="arcade-roof" /><div className="arcade-stands" /><div className="arcade-pitch"><div /></div>
      </div>
      <header className="arcade-brand">
        <img src="/assets/images/100.png" alt="" />
        <h1><span>FOOTY HEAD</span><strong>HERMANOS</strong></h1>
        <img src="/assets/images/109.png" alt="" />
      </header>
      <div className="arcade-content">{children}</div>
      <footer className="arcade-footer">FÚTBOL DE CABEZONES · RIVALIDAD DE HERMANOS</footer>
    </main>
  );
}
