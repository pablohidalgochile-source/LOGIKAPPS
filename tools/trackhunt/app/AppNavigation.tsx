"use client";
import { usePathname } from "next/navigation";
const modules = [
  {href:"/", label:"Versiones"},
  {href:"/sets", label:"Sets"},
  {href:"/playlist-hunt", label:"Playlist Hunt"},
  {href:"/quality", label:"Mejor calidad"},
  {href:"/connections", label:"Conexiones"},
];
export default function AppNavigation() {
  const pathname = usePathname();
  const active = modules.find(item=>item.href===pathname);
  const setLink = (anchor:string)=>pathname==="/sets"?`#${anchor}`:`/sets#${anchor}`;
  return <header className="site-header app-navigation">
    <a className="brand" href="/" aria-label="Track Hunt, inicio"><span className="brand-mark">TH</span><span>TRACKHUNT{active ? ` · ${active.label.toUpperCase()}` : ""}</span></a>
    <nav className="nav-links" aria-label="Navegación principal">{modules.map(item=><a key={item.href} href={item.href} aria-current={pathname===item.href?"page":undefined}>{item.label}</a>)}<a href={setLink("workflow")}>Cómo funciona</a><a href={setLink("results")}>Resultado</a><a href={setLink("legal")}>Uso legal</a></nav>
    <a className="deezer-status connected" href={setLink("top")}><span/>Analizar un set</a>
  </header>;
}
