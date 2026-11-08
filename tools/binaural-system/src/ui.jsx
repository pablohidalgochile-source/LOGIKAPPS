import React from 'react';

/* Anillos de campo magnético (elipses concéntricas) */
function FieldRings({ color = "var(--blue)", count = 4, size = 180, top = "50%", left = "50%", opacity = 0.5 }) {
  return (
    <div aria-hidden="true" className="field-rings" style={{ color, top, left, width: size, height: size, opacity, transform: "translate(-50%,-50%)" }}>
      {Array.from({ length: count }).map((_, i) => {
        const s = size * (0.4 + (i / count) * 0.6);
        return <span key={i} style={{ width: s, height: s }} />;
      })}
    </div>
  );
}

/* Card genérica — children, className?:string, glow?:bool, style?:obj */
function Card({ children, className = "", glow = true, style, onClick }) {
  return <div className={`card ${glow ? "glow" : ""} ${className}`} style={style} onClick={onClick}>{children}</div>;
}

/* title:string, sub?:string, right?:node */
function CardHead({ title, sub, right }) {
  return (
    <div className="card-h">
      <div className="t">{title}{sub && <small>{sub}</small>}</div>
      {right}
    </div>
  );
}


export { Card, CardHead, FieldRings };
