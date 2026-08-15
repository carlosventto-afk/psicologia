"use client";

import { useActionState } from "react";

const estadoInicial = {};

export default function DadosFiscaisForm({ action, dadosFiscais }) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);

  return (
    <form action={formAction} className="max-w-lg space-y-4 card p-6">
      <h2 className="text-lg font-bold text-navy">Dados de Emissão</h2>

      <div>
        <label htmlFor="tipo_documento" className="block text-sm font-semibold text-navy">
          Tipo de documento
        </label>
        <select
          id="tipo_documento"
          name="tipo_documento"
          required
          defaultValue={dadosFiscais?.tipo_documento ?? "cpf"}
          className="field"
        >
          <option value="cpf">CPF (autônomo)</option>
          <option value="cnpj">CNPJ (empresa)</option>
        </select>
      </div>

      <div>
        <label htmlFor="documento" className="block text-sm font-semibold text-navy">
          CPF/CNPJ do emitente
        </label>
        <input id="documento" name="documento" type="text" required defaultValue={dadosFiscais?.documento ?? ""} className="field" />
      </div>

      <div>
        <label htmlFor="inscricao_municipal" className="block text-sm font-semibold text-navy">
          Inscrição Municipal
        </label>
        <input
          id="inscricao_municipal"
          name="inscricao_municipal"
          type="text"
          defaultValue={dadosFiscais?.inscricao_municipal ?? ""}
          className="field"
        />
        <p className="text-xs text-muted mt-1">Obrigatória na maioria dos municípios.</p>
      </div>

      <div>
        <label htmlFor="nome_empresarial" className="block text-sm font-semibold text-navy">
          Nome / Nome Empresarial
        </label>
        <input
          id="nome_empresarial"
          name="nome_empresarial"
          type="text"
          required
          defaultValue={dadosFiscais?.nome_empresarial ?? ""}
          className="field"
        />
      </div>

      <div>
        <label htmlFor="email_nfse" className="block text-sm font-semibold text-navy">
          E-mail
        </label>
        <input id="email_nfse" name="email_nfse" type="email" required defaultValue={dadosFiscais?.email_nfse ?? ""} className="field" />
      </div>

      <div>
        <label htmlFor="telefone_nfse" className="block text-sm font-semibold text-navy">
          Telefone
        </label>
        <input id="telefone_nfse" name="telefone_nfse" type="text" defaultValue={dadosFiscais?.telefone_nfse ?? ""} className="field" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <label htmlFor="logradouro" className="block text-sm font-semibold text-navy">
            Endereço
          </label>
          <input id="logradouro" name="logradouro" type="text" required defaultValue={dadosFiscais?.logradouro ?? ""} className="field" />
        </div>
        <div>
          <label htmlFor="numero" className="block text-sm font-semibold text-navy">
            Número
          </label>
          <input id="numero" name="numero" type="text" required defaultValue={dadosFiscais?.numero ?? ""} className="field" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="complemento" className="block text-sm font-semibold text-navy">
            Complemento
          </label>
          <input id="complemento" name="complemento" type="text" defaultValue={dadosFiscais?.complemento ?? ""} className="field" />
        </div>
        <div>
          <label htmlFor="bairro" className="block text-sm font-semibold text-navy">
            Bairro
          </label>
          <input id="bairro" name="bairro" type="text" required defaultValue={dadosFiscais?.bairro ?? ""} className="field" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label htmlFor="municipio_ibge" className="block text-sm font-semibold text-navy">
            Código IBGE do município
          </label>
          <input
            id="municipio_ibge"
            name="municipio_ibge"
            type="text"
            required
            pattern="\d{7}"
            title="7 dígitos"
            defaultValue={dadosFiscais?.municipio_ibge ?? ""}
            className="field"
          />
          <p className="text-xs text-muted mt-1">
            Consulte em{" "}
            <a href="https://www.ibge.gov.br/explica/codigos-dos-municipios.php" target="_blank" rel="noreferrer" className="underline">
              ibge.gov.br
            </a>
            .
          </p>
        </div>
        <div>
          <label htmlFor="uf" className="block text-sm font-semibold text-navy">
            UF
          </label>
          <input id="uf" name="uf" type="text" required maxLength={2} defaultValue={dadosFiscais?.uf ?? ""} className="field" />
        </div>
        <div>
          <label htmlFor="cep" className="block text-sm font-semibold text-navy">
            CEP
          </label>
          <input id="cep" name="cep" type="text" required defaultValue={dadosFiscais?.cep ?? ""} className="field" />
        </div>
      </div>

      <fieldset className="space-y-3 border-t border-border pt-4">
        <legend className="text-sm font-semibold text-navy px-0">Regime tributário</legend>
        <div>
          <label htmlFor="optante_simples_nacional" className="block text-sm font-semibold text-navy">
            Simples Nacional
          </label>
          <select
            id="optante_simples_nacional"
            name="optante_simples_nacional"
            required
            defaultValue={dadosFiscais?.optante_simples_nacional ?? 3}
            className="field"
          >
            <option value={1}>Não optante</option>
            <option value={2}>Optante MEI</option>
            <option value={3}>Optante ME/EPP</option>
          </select>
        </div>
        <div>
          <label htmlFor="regime_apuracao_sn" className="block text-sm font-semibold text-navy">
            Regime de apuração (Simples Nacional)
          </label>
          <input
            id="regime_apuracao_sn"
            name="regime_apuracao_sn"
            type="number"
            defaultValue={dadosFiscais?.regime_apuracao_sn ?? ""}
            className="field"
          />
          <p className="text-xs text-muted mt-1">
            Obrigatório quando optante ME/EPP — confira o código exato no manual da NFS-e Nacional antes da primeira
            emissão.
          </p>
        </div>
      </fieldset>

      <div>
        <label htmlFor="codigo_tributacao_nacional" className="block text-sm font-semibold text-navy">
          Código de Tributação Nacional (LC 116)
        </label>
        <input
          id="codigo_tributacao_nacional"
          name="codigo_tributacao_nacional"
          type="text"
          required
          defaultValue={dadosFiscais?.codigo_tributacao_nacional ?? ""}
          className="field"
        />
        <p className="text-xs text-muted mt-1">Confirme o código certo com seu contador antes de emitir a primeira nota.</p>
      </div>

      <div>
        <label htmlFor="codigo_tributacao_municipal" className="block text-sm font-semibold text-navy">
          Código de Tributação Municipal
        </label>
        <input
          id="codigo_tributacao_municipal"
          name="codigo_tributacao_municipal"
          type="text"
          defaultValue={dadosFiscais?.codigo_tributacao_municipal ?? ""}
          className="field"
        />
        <p className="text-xs text-muted mt-1">
          Desdobro municipal do código acima — alguns municípios (ex.: Rio de Janeiro) exigem esse código além do
          nacional. Confirme com seu contador ou com a prefeitura se o seu município exige.
        </p>
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.sucesso && <p className="text-sm text-green-700">Dados fiscais salvos.</p>}

      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
        {pending ? "Salvando..." : "Salvar dados fiscais"}
      </button>
    </form>
  );
}
