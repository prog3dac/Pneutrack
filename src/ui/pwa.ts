/**
 * App installabile (PWA): service worker per l'uso senza rete, pulsante «Installa l'app»,
 * avviso quando è pronta una versione nuova e apertura dei file .pneu.json dal sistema
 * (doppio clic o «Apri con» sull'app installata, dove il browser lo consente).
 */

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
interface LaunchParams { files: FileSystemFileHandle[] }
interface LaunchQueue { setConsumer(consumer: (params: LaunchParams) => void): void }

export interface PwaHooks {
  /** messaggio breve in basso */
  toast(msg: string): void;
  /** apre uno schema (stessa strada di «Importa file…») */
  openFile(file: File): Promise<void>;
}

/** L'app gira nella sua finestra (installata) e non in una scheda del browser. */
export function isStandalone(): boolean {
  return matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Pagina pubblicata su claude.ai: lì niente service worker né installazione (ci pensa la piattaforma). */
const inClaude = () => "claude" in window;

export function initPwa(hooks: PwaHooks) {
  const installBtn = document.querySelector<HTMLButtonElement>("#btn-install")!;
  const dialog = document.querySelector<HTMLElement>("#install-dialog")!;
  let deferred: InstallPrompt | null = null;

  // --- file aperti dal sistema con l'app installata ---------------------------------
  const queue = (window as Window & { launchQueue?: LaunchQueue }).launchQueue;
  queue?.setConsumer(async ({ files }) => {
    for (const handle of files.slice(0, 1)) await hooks.openFile(await handle.getFile());
  });

  if (inClaude()) return;

  // --- installazione ------------------------------------------------------------------
  const refreshButton = () => { installBtn.hidden = isStandalone(); };
  refreshButton();
  matchMedia("(display-mode: standalone)").addEventListener("change", refreshButton);
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // il browser lo propone dal menu File, non con un banner suo
    deferred = e as InstallPrompt;
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    dialog.hidden = true;
    hooks.toast("Pneutrack è installata: la trovi tra le app del computer");
  });
  installBtn.addEventListener("click", async () => {
    installBtn.closest("details")?.removeAttribute("open");
    if (deferred) {
      const p = deferred;
      deferred = null; // il browser lo concede una volta sola
      await p.prompt();
      const { outcome } = await p.userChoice;
      if (outcome === "dismissed") hooks.toast("Installazione annullata: si può riprovare dal menu File");
      return;
    }
    dialog.hidden = false; // Safari, Firefox o richiesta già usata: le istruzioni
  });
  dialog.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t === dialog || t.closest("[data-iact=close]")) dialog.hidden = true;
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !dialog.hidden) dialog.hidden = true;
  });

  // --- service worker e versioni nuove -------------------------------------------------
  if (!import.meta.env.PROD || !("serviceWorker" in navigator) || !isSecureContext) return;
  const bar = document.querySelector<HTMLElement>("#update-bar")!;
  let reloading = false;
  let waiting: ServiceWorker | null = null; // versione nuova pronta, in attesa del clic
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!reloading) return; // primo avvio: il service worker prende la pagina, nulla da ricaricare
    location.reload();
  });
  const offer = (worker: ServiceWorker) => { waiting = worker; bar.hidden = false; };
  document.querySelector("#update-now")!.addEventListener("click", () => {
    if (!waiting) return;
    reloading = true; // prima di ricaricare la pagina salva il progetto (beforeunload)
    waiting.postMessage("skip-waiting");
  });
  document.querySelector("#update-later")!.addEventListener("click", () => { bar.hidden = true; });

  const start = async () => {
    let reg: ServiceWorkerRegistration;
    try {
      reg = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
    } catch {
      return; // senza service worker l'app funziona lo stesso, ma solo con la rete
    }
    const watch = (worker: ServiceWorker | null) => {
      if (!worker) return;
      const ready = () => { if (worker.state === "installed" && navigator.serviceWorker.controller) offer(worker); };
      ready();
      worker.addEventListener("statechange", ready);
    };
    watch(reg.waiting);
    watch(reg.installing);
    reg.addEventListener("updatefound", () => watch(reg.installing));
    // l'app installata può restare aperta per giorni: controlla ogni ora e quando torna in primo piano
    const check = () => { if (navigator.onLine) reg.update().catch(() => {}); };
    setInterval(check, 60 * 60 * 1000);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
  };
  // dopo il caricamento, per non rubare banda all'avvio
  if (document.readyState === "complete") void start();
  else window.addEventListener("load", () => void start(), { once: true });
}
