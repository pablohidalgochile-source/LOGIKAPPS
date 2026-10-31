import {AppError,amount,validDate} from './store.mjs';

// Pilot token is bound to one local owner. It is never returned to the browser.
export function createDebtProvider({token=process.env.ORGALINA_KHIPU_TOKEN,userId=process.env.ORGALINA_KHIPU_USER_ID,fetcher=fetch}={}) {
  return {
    available(user){return !!token&&!!userId&&user.id===userId&&!user.id.startsWith('demo-');},
    async consult(user,service){
      if(!this.available(user))throw new AppError('La consulta a Khipu/Servipag aún no está habilitada para tu cuenta. Puedes leer una boleta en PDF.',503);
      let response;
      try{response=await fetcher('https://api.khipu.com/v1/com/services/servipag.com/consult-debt',{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({RequestData:{EnterpriseName:service.company,ClientIdentifier:service.clientNumber}})});}catch{throw new AppError('El proveedor no respondió a tiempo. No se incorporó ningún gasto.',502);}
      if(response.status===401||response.status===403)throw new AppError('El acceso del proveedor requiere revisión o renovación. No se consultó la deuda.',502);
      if(!response.ok||response.status===202)throw new AppError('La consulta no se completó. No se incorporó ningún gasto; podrás intentarlo más tarde.',502);
      let raw='',size=0;
      for await(const chunk of response.body){size+=chunk.length;if(size>128000)throw new AppError('Respuesta del proveedor demasiado grande.',502);raw+=new TextDecoder().decode(chunk);}
      let result;try{result=JSON.parse(raw);}catch{throw new AppError('Respuesta del proveedor no reconocida.',502);}
      const debt=result.Data?.Debt;
      if(result.Status!=='OK'||result.Error||!debt)throw new AppError('El proveedor no entregó una deuda verificable. Esto no confirma que la cuenta esté al día.',502);
      try{amount(debt.PendingDebt);if(debt.DueDate)validDate(debt.DueDate);}catch{throw new AppError('El proveedor devolvió montos o fechas que necesitan revisión.',502);}
      return {amount:debt.PendingDebt,dueDate:debt.DueDate||'',operationId:typeof result.OperationId==='string'?result.OperationId.slice(0,80):'',incomplete:!!result.AdditionalInformation};
    }
  };
}
