import {parentPort,workerData} from 'node:worker_threads';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
let loading;
try {
  loading=getDocument({data:workerData,isEvalSupported:false,useSystemFonts:false,verbosity:0});
  const pdf=await loading.promise;
  if(pdf.numPages>20)throw new Error('El piloto admite documentos de hasta 20 páginas.');
  let text='';
  for(let n=1;n<=pdf.numPages;n++){
    const page=await pdf.getPage(n), content=await page.getTextContent();
    let previousY=null;
    for(const item of content.items){
      if(!('str' in item))continue;
      const y=item.transform?.[5];
      if(previousY!==null&&Math.abs(y-previousY)>3)text+='\n';
      text+=item.str+(item.hasEOL?'\n':' ');previousY=item.hasEOL?null:y;
      if(text.length>100000)throw new Error('El documento tiene demasiado texto para este piloto.');
    }
    text+='\n';
  }
  if(text.trim().length<30)throw new Error('Este PDF parece una imagen escaneada. El piloto lee PDF con texto; descarga la boleta original o pega su texto.');
  parentPort.postMessage({text});
}catch(e){parentPort.postMessage({error:e.name==='PasswordException'?'El PDF tiene contraseña. Usa una copia desbloqueada.':e.message?.startsWith('El ')||e.message?.startsWith('Este ')?e.message:'No pudimos leer este PDF. Prueba el original descargado de la empresa.'});}
finally{await loading?.destroy();}
