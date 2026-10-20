import { useEffect, useRef, useState } from "react";
type Modele = { nom: string; fond: string; motif?: "pois" | "lignes"; grille?: boolean };
const modeles: Modele[] = [
  { nom: "Photomaton", fond: "#E8E2D9" },
  { nom: "Papier bleu", fond: "#789AB1" },
  { nom: "Papier rouge", fond: "#A33D36" },
  { nom: "Pois vintage", fond: "#F3EFE7", motif: "pois" },
  { nom: "Collage olive", fond: "#626B4F", motif: "lignes" },
  { nom: "Quatre poses", fond: "#B49A7B", grille: true },
];
const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const image = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const im = new Image(); im.onload = () => resolve(im); im.onerror = reject; im.src = src;
});
function photoCadree(ctx: CanvasRenderingContext2D, im: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const ratio = Math.max(w / im.width, h / im.height);
  const iw = w / ratio, ih = h / ratio;
  ctx.drawImage(im, (im.width - iw) / 2, (im.height - ih) / 2, iw, ih, x, y, w, h);
}
function dessinerFond(ctx: CanvasRenderingContext2D, m: Modele, taille: number) {
  ctx.fillStyle = m.fond; ctx.fillRect(0, 0, taille, taille);
  if (m.motif === "pois") {
    ctx.fillStyle = "rgba(65,54,44,.19)";
    for (let y = 18; y < taille; y += 44) for (let x = 18; x < taille; x += 44) {
      ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (m.motif === "lignes") {
    ctx.strokeStyle = "rgba(255,255,255,.10)";
    for (let x = 0; x < taille; x += 24) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, taille); ctx.stroke(); }
  }
}
async function composer(photos: string[], modele: Modele, ombre: number, filtre: string): Promise<HTMLCanvasElement> {
  const taille = 1200, canvas = document.createElement("canvas");
  canvas.width = taille; canvas.height = taille;
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Canvas indisponible");
  dessinerFond(ctx, modele, taille);
  const images = await Promise.all(photos.map(image));
  if (!images.length) return canvas;
  const grille = modele.grille || images.length > 1;
  const cols = grille ? 2 : 1, lignes = Math.ceil(Math.min(images.length, 4) / cols);
  const cadreW = grille ? 580 : 560, cadreH = grille ? 350 * lignes + 72 : 760;
  const x = (taille - cadreW) / 2, y = (taille - cadreH) / 2;
  ctx.save();
  ctx.translate(taille / 2, taille / 2); ctx.rotate(-0.045); ctx.translate(-taille / 2, -taille / 2);
  ctx.shadowColor = "rgba(28,21,15,.65)"; ctx.shadowBlur = ombre * 1.7;
  ctx.shadowOffsetX = ombre * .6; ctx.shadowOffsetY = ombre * .9;
  ctx.fillStyle = "#F8F5EE"; ctx.fillRect(x, y, cadreW, cadreH);
  ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  const pad = 24, gap = 12, innerW = cadreW - pad * 2;
  const colsEffectifs = grille ? 2 : 1;
  const w = (innerW - gap * (colsEffectifs - 1)) / colsEffectifs;
  const h = grille ? 325 : 680;
  images.slice(0, 4).forEach((im, i) => {
    const px = x + pad + (i % colsEffectifs) * (w + gap);
    const py = y + pad + Math.floor(i / colsEffectifs) * (h + gap);
    ctx.save(); ctx.beginPath(); ctx.rect(px, py, w, h); ctx.clip();
    ctx.filter = filtre === "nb" ? "grayscale(1) contrast(1.14)" : filtre === "sepia" ? "sepia(.85) contrast(1.08)" : "contrast(1.06) saturate(.82)";
    photoCadree(ctx, im, px, py, w, h); ctx.restore();
  });
  ctx.restore();
  return canvas;
}
export default function App() {
  const [choix, setChoix] = useState(1);
  const [ombre, setOmbre] = useState(38);
  const [filtre, setFiltre] = useState("nb");
  const [nombre, setNombre] = useState(4);
  const [photos, setPhotos] = useState<string[]>([]);
  const [compte, setCompte] = useState<number | null>(null);
  const [camera, setCamera] = useState(false);
  const [erreur, setErreur] = useState("");
  const [apercu, setApercu] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const flux = useRef<MediaStream | null>(null);
  const captureEnCours = useRef(false);
  useEffect(() => () => { flux.current?.getTracks().forEach(t => t.stop()); }, []);
  useEffect(() => {
    let actif = true;
    composer(photos, modeles[choix], ombre, filtre).then(c => { if (actif) setApercu(c.toDataURL("image/png")); }).catch(() => {});
    return () => { actif = false; };
  }, [photos, choix, ombre, filtre]);
  async function demarrer() {
    try {
      setErreur("");
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Caméra non disponible dans ce navigateur.");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      flux.current?.getTracks().forEach(t => t.stop()); flux.current = stream;
      setCamera(true);
      // React mounts the video after the state update.
      requestAnimationFrame(() => { if (video.current) { video.current.srcObject = stream; void video.current.play(); } });
    } catch { setErreur("Impossible d’ouvrir la caméra. Autorisez son accès ou importez vos photos."); }
  }
  function arreter() { flux.current?.getTracks().forEach(t => t.stop()); flux.current = null; setCamera(false); }
  async function prendrePhotos() {
    if (captureEnCours.current || !video.current || video.current.readyState < 2) return;
    captureEnCours.current = true; setPhotos([]); setErreur("");
    const resultats: string[] = [];
    try {
      for (let n = 0; n < nombre; n++) {
        for (let s = 3; s >= 1; s--) { setCompte(s); await pause(950); }
        setCompte(null);
        const v = video.current; if (!v || !v.videoWidth) throw new Error("Vidéo indisponible");
        const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight;
        const ctx = c.getContext("2d"); if (!ctx) throw new Error("Canvas indisponible");
        ctx.translate(c.width, 0); ctx.scale(-1, 1); ctx.drawImage(v, 0, 0);
        resultats.push(c.toDataURL("image/jpeg", .92)); setPhotos([...resultats]); await pause(350);
      }
    } catch { setErreur("La prise de vue a été interrompue. Réessayez."); }
    finally { setCompte(null); captureEnCours.current = false; }
  }
  function importer(e: React.ChangeEvent<HTMLInputElement>) {
    const fichiers = Array.from(e.target.files || []).slice(0, 4);
    if (!fichiers.length) return;
    Promise.all(fichiers.map(f => new Promise<string>((resolve, reject) => {
      if (!f.type.startsWith("image/")) { reject(new Error("Format non reconnu")); return; }
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(f);
    }))).then(setPhotos).catch(() => setErreur("Choisissez des images compatibles."));
    e.target.value = "";
  }
  async function telecharger() {
    if (!photos.length) return;
    try {
      const canvas = await composer(photos, modeles[choix], ombre, filtre);
      const lien = document.createElement("a"); lien.href = canvas.toDataURL("image/png"); lien.download = "photobooth-studio.png"; lien.click();
    } catch { setErreur("L’export a échoué. Essayez avec des images plus petites."); }
  }
  return <div className="site">
    <header><a className="logo" href="#accueil">photobooth<span>.</span></a><nav><a href="#studio">Le studio</a><a href="#modeles">Les modèles</a></nav><a className="bouton" href="#studio">Entrer dans le studio ↗</a></header>
    <main id="accueil"><div className="intro"><p className="surtitre">UN STUDIO PHOTO À EMPORTER</p><h1>Vos instants,<br/><em>sur papier.</em></h1><p>Un photomaton rétro et un atelier de création pour transformer vos souvenirs en tirages uniques.</p><a className="bouton" href="#studio">Découvrir le studio ↗</a></div>
      <section className="atelier" id="studio"><div className="atelier-titre"><span>01 / LE STUDIO</span><h2>Composez votre souvenir.</h2><p>Prenez vos photos ou importez-les, choisissez un modèle, puis téléchargez votre création.</p></div>
        <div className="capture"><div className="camera-zone">{camera ? <div className="video-box"><video ref={el => { video.current = el; if (el && flux.current && el.srcObject !== flux.current) { el.srcObject = flux.current; void el.play(); } }} autoPlay muted playsInline />{compte !== null && <strong className="compte">{compte}</strong>}</div> : <div className="camera-vide"><span>Votre séance commence ici</span></div>}</div>
          <div className="capture-actions"><label>Nombre de poses <select value={nombre} onChange={e => setNombre(Number(e.target.value))}>{[1,2,3,4].map(n => <option key={n} value={n}>{n}</option>)}</select></label>{camera ? <><button onClick={prendrePhotos} disabled={compte !== null}>Prendre les photos</button><button className="secondaire" onClick={arreter}>Fermer la caméra</button></> : <button onClick={demarrer}>Activer la caméra</button>}<label className="importer">Importer des photos<input type="file" accept="image/*" multiple onChange={importer} /></label></div>
          {erreur && <p role="alert" className="erreur">{erreur}</p>}
        </div>
        <div className="editeur"><aside id="modeles"><h3>Modèles</h3><div className="modeles">{modeles.map((m,i)=><button key={m.nom} aria-pressed={choix===i} className={choix===i?"modele actif":"modele"} onClick={()=>setChoix(i)}><span className="miniature" style={{background:m.fond}}/><span>{m.nom}</span></button>)}</div></aside>
          <div className="scene" style={{background:modeles[choix].fond}}>{apercu && <img className="rendu" src={apercu} alt="Aperçu de votre composition" />}{!photos.length && <span className="indice">Ajoutez une photo pour commencer</span>}</div>
          <aside className="reglages"><h3>Personnalisation</h3><label htmlFor="filtre">Filtre</label><select id="filtre" value={filtre} onChange={e=>setFiltre(e.target.value)}><option value="nb">Noir et blanc</option><option value="sepia">Sépia</option><option value="couleur">Couleur vintage</option></select><label htmlFor="ombre">Intensité de l’ombre <strong>{ombre}%</strong></label><input id="ombre" type="range" min="0" max="90" value={ombre} onChange={e=>setOmbre(Number(e.target.value))}/><p>{photos.length} photo{photos.length>1?"s":""} sélectionnée{photos.length>1?"s":""}</p><button className="telecharger" disabled={!photos.length} onClick={telecharger}>Télécharger en PNG ↓</button><button className="effacer" disabled={!photos.length} onClick={()=>setPhotos([])}>Recommencer</button></aside>
        </div>
      </section></main><footer>PHOTOBOOTH STUDIO · FABRIQUEZ VOS SOUVENIRS</footer>
  </div>;
}
