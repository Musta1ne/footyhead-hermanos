import { useRouteError } from "react-router-dom";

export default function ErrorPage() {
    const error = useRouteError() as { statusText: string; message: string };
    console.error(error);

    return (
        <div id="error-page">
            <h1>No se pudo abrir la partida</h1>
            <p>Revisá el servidor o pedí un enlace nuevo.</p>
            <p>
                <i>{error.statusText || error.message}</i>
            </p>
            <a href="/play">Volver a crear una sala</a>
        </div>
    );
}
