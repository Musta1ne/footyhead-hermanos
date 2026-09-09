import { Form, Link, useActionData } from "react-router-dom";
import { CopyToClipboard } from "react-copy-to-clipboard";
import { Button, Title } from "../layout";
import { useState } from "react";

const prettyPrint = (str: string) =>
  str && `${str.slice(0, 5)}-${str.slice(5)}`;

function Play() {
  const [copyButtonText, setCopyButtonText] = useState<string>("Copiar enlace");
  const { pin } = (useActionData() as { pin: string; roomID: string }) || {};

  return (
    <>
      <Title>Footy Head</Title>
      <div className="lobby-card honk-font">
        <div className="lobby-card--title">Crear una partida</div>
        <div className="lobby-card--desc">Código de sala: </div>
        {pin ? (
          <div className="lobby-card--pin-container">
            <div className="lobby-card--pin">{prettyPrint(pin)}</div>
            <CopyToClipboard
              text={`${window.location.origin}/play/${pin}`}
              onCopy={() => setCopyButtonText("¡Copiado!")}
            >
              <Button>{copyButtonText}</Button>
            </CopyToClipboard>
          </div>
        ) : null}
      </div>
      <p>Copiá el enlace y mandáselo a tu hermano. Entrá desde esta pestaña: vos jugás a la izquierda y él a la derecha.</p>
      <div style={{ display: "flex" }}>
        <Link to="../">
          <Button>← Volver</Button>
        </Link>
        <Form id="create-pin" method="post">
          {pin ? (
            <Link to={pin}>
              <Button>Entrar a jugar</Button>
            </Link>
          ) : (
            <Button>Crear sala</Button>
          )}
        </Form>
      </div>
    </>
  );
}

export default Play;
