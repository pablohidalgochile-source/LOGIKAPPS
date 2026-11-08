import { findMusicRecipe, suggestMusicRecipes, MUSIC_KNOWLEDGE_VERSION, type MusicRecipe } from './music-recipes.ts';

// Reviewed synthesis, not executable instructions loaded from downloaded repositories.
// Original prose, informed by the licensed references listed in research/README.md.
export const musicalCraft = `CONOCIMIENTO MUSICAL REVISADO · ${MUSIC_KNOWLEDGE_VERSION}
Las recetas son puntos de partida editoriales, no presets oficiales ni resultados de escucha. Un consejo comunitario no demuestra cómo funciona internamente Suno. No conviertas etiquetas, porcentajes, BPM, tonalidad o duración en garantías. Separa hechos oficiales de hipótesis creativas. No inventes comandos de control como START_ON, pesos de tokens, mezcla/masterización o ajustes ocultos.
PRIORIDAD: decisiones explícitas del usuario > secciones y controles activos > identidad de colección > receta de referencia > propuestas del modelo. Una receta elegida no cambia el BPM, idioma, voces, historia, acordes ni secciones actuales. Los valores sugeridos de una receta solo son defaults al aplicar expresamente el preset en la interfaz. No presentes las referencias como órdenes del usuario.
COMPOSICIÓN DEL PROMPT:
1. Define el género ancla, un motivo reconocible y el movimiento del groove. Una fusión necesita un mecanismo compartido: pulso, contrapunto, respuesta o textura. Evita acumular géneros sin explicar sus funciones.
2. Describe instrumentos por función y momento: quién lleva pulso, quién sostiene armonía, quién responde y cuándo deja espacio. La paleta mínima depende del brief; conserva TODOS los instrumentos explícitos aunque el usuario pida una formación grande.
3. Describe la voz mediante timbre, registro, articulación, cercanía y trayectoria. En un dúo distingue los dos papeles y su encuentro; no conviertas identidades vocales en promesas de reproducción de una persona.
4. Relaciona la emoción con decisiones audibles: menor densidad en estrofa, respuesta al final de frase, registro que se abre en coro, puente que resta instrumentos. Un contraste deliberado entre secciones no es una contradicción.
5. Usa frases musicales claras. Ajusta la longitud a la complejidad: un brief simple admite un Style corto; un arreglo detallado necesita espacio. No rellenes para alcanzar un mínimo editorial. Las restricciones de tamaño de la app son presupuestos de texto, no límites oficiales del proveedor.
6. Styles describe sonido; Lyrics contiene palabras cantables y pocas acotaciones; Exclude contiene solo ausencias pertinentes; direction explica el plan. El guion largo no se pega entero en Lyrics. No dupliques la historia completa en Styles.
LETRA E INTERPRETACIÓN:
- Sitúa cada verso con una acción, objeto o escena. Haz avanzar el relato; el puente aporta un giro y no otra lista de sinónimos. Conserva perspectiva, destinatario y frases que pidió el usuario.
- Diseña un estribillo reconocible y repetible. Repite su texto completo en los bloques previstos. La rima está al servicio del sentido: no retuerzas el orden natural para hacerla exacta.
- Revisa acentos, longitud de frase y lugares de respiración según género y tempo. Rap puede necesitar más densidad que bolero; no impongas el mismo conteo de palabras a ambos. Un coro de prueba o fragmento breve no requiere una canción completa.
- En español conserva dicción natural y el registro cultural indicado. En Spanglish decide qué idioma conduce el gancho; no alternes idiomas al azar. Traduce para que sea cantable, sin fingir conocer una melodía no recibida.
- Los encabezados explícitos de la app se conservan exactamente. Usa indicaciones breves entre corchetes cuando sean necesarias, sin amontonar etiquetas experimentales. El reparto vocal no se escribe como letra cantada. Instrumental significa sin voz, sin coro y sin palabras cantadas.
VARIANTES Y REVISIÓN:
- Tres alternativas deben cambiar decisiones audibles manteniendo la misma canción. Sus nombres describen esas decisiones. Una alternativa de club solo tiene sentido si encaja con el brief; folk, bolero, ambient o música de fondo no se convierten en EDM por ocupar una posición.
- Antes de responder comprueba identidad, voces, idioma, tempo, secciones, armonía, exclusiones y tamaños. Corrige conflictos accidentales sin eliminar contrastes intencionales. No reescribas decisiones explícitas para encajar en una receta.
- Propón pruebas de una variable cada vez. Evaluar coherencia textual no es escuchar audio ni demostrar que una generación salió mejor.`;

export function recipeReference(recipe:MusicRecipe){
  return {id:recipe.id,name:recipe.name,evidence:recipe.evidence,genre:recipe.genre,groove:recipe.groove,
    instrumentRoles:recipe.palette,production:recipe.production,arrangement:recipe.arc,lyricCraft:recipe.lyricCraft,
    possibleAlternatives:recipe.alternatives,optionalExclusions:recipe.exclude,exampleStyle:recipe.exampleStyle};
}
export function musicKnowledgeContext(input:{recipeId?:string;idea?:string;inspiration?:string;identity?:string;instructions?:string}){
  const chosen=findMusicRecipe(input.recipeId);
  const recipes=chosen?[chosen]:suggestMusicRecipes([input.idea,input.inspiration,input.identity].filter(Boolean).join(' '),2);
  return musicalCraft+(recipes.length?`\nREFERENCIAS DE RECETA (${chosen?'seleccionada por el usuario':'sugeridas por coincidencia de género; no sustituyen el brief'}):\n${JSON.stringify(recipes.map(recipeReference))}`:'\nSin receta coincidente: compón desde el brief sin forzar un género del catálogo.');
}
