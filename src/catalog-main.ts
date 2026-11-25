// Punto d'ingresso della pagina del catalogo dei simboli (simboli.html).
import "./ui/style.css";
import "./ui/catalog.css";
import { renderCatalog } from "./ui/catalog";

document.getElementById("catalog")!.innerHTML = renderCatalog();
