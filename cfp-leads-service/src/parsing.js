export function classifyBuscaResponse(status, body) {
  if (status === 200) {
    if (Array.isArray(body) && body.length === 1) {
      return { type: "found", result: body[0] };
    }
    if (Array.isArray(body) && body.length === 0) {
      return { type: "not_found" };
    }
    return {
      type: "unexpected",
      detail: `status 200 com corpo inesperado: ${JSON.stringify(body)}`,
    };
  }
  if (status === 422) {
    if (body && Array.isArray(body.recaptchaToken)) {
      return { type: "captcha_failure" };
    }
    if (body && Array.isArray(body.nome)) {
      return { type: "validation_error", detail: body.nome.join("; ") };
    }
    return { type: "validation_error", detail: JSON.stringify(body) };
  }
  return { type: "unexpected", detail: `status HTTP ${status}` };
}

export function mapApiResultToLead(apiResult, crpRegiao) {
  return {
    crpRegiao,
    crpRegistro: parseInt(apiResult.registro, 10),
    nome: apiResult.Nome,
    situacao: apiResult.situacao,
    dataInscricao: apiResult.dataInscricao || null,
  };
}
