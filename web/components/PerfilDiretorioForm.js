"use client";

import { useActionState } from "react";

const estadoInicial = {};

export default function PerfilDiretorioForm({ action, perfil, especialidades }) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);

  return (
    <form action={formAction} className="max-w-2xl space-y-4 card p-6">
      <div>
        <label htmlFor="bio" className="block text-sm font-semibold text-navy">
          Bio
        </label>
        <textarea
          id="bio"
          name="bio"
          rows={4}
          defaultValue={perfil?.bio}
          className="field"
        />
      </div>

      <div>
        <label htmlFor="foto" className="block text-sm font-semibold text-navy">
          Foto de perfil
        </label>
        {perfil?.foto_url && (
          <img
            src={perfil.foto_url}
            alt="Foto atual"
            className="h-16 w-16 rounded-full object-cover mt-1 mb-2"
          />
        )}
        <input id="foto" name="foto" type="file" accept="image/*" className="field" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="cidade" className="block text-sm font-semibold text-navy">
            Cidade
          </label>
          <input
            id="cidade"
            name="cidade"
            type="text"
            defaultValue={perfil?.cidade}
            className="field"
          />
        </div>
        <div>
          <label htmlFor="estado" className="block text-sm font-semibold text-navy">
            Estado
          </label>
          <input
            id="estado"
            name="estado"
            type="text"
            maxLength={2}
            placeholder="SP"
            defaultValue={perfil?.estado}
            className="field"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="modalidade" className="block text-sm font-semibold text-navy">
            Modalidade
          </label>
          <select
            id="modalidade"
            name="modalidade"
            defaultValue={perfil?.modalidade ?? "ambos"}
            className="field"
          >
            <option value="presencial">Presencial</option>
            <option value="online">Online</option>
            <option value="ambos">Ambos</option>
          </select>
        </div>
        <div>
          <label htmlFor="valor_sessao" className="block text-sm font-semibold text-navy">
            Valor da sessão (opcional)
          </label>
          <input
            id="valor_sessao"
            name="valor_sessao"
            type="number"
            step="0.01"
            placeholder="A combinar"
            defaultValue={perfil?.valor_sessao ?? ""}
            className="field"
          />
        </div>
      </div>

      <div>
        <p className="block text-sm font-semibold text-navy mb-2">Especialidades</p>
        <div className="grid grid-cols-2 gap-2">
          {especialidades.map((esp) => (
            <label key={esp.id} className="flex items-center gap-2 text-sm text-navy">
              <input
                type="checkbox"
                name="especialidades"
                value={esp.id}
                defaultChecked={perfil?.especialidade_ids?.includes(esp.id)}
              />
              {esp.nome}
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="visivel_diretorio"
          name="visivel_diretorio"
          type="checkbox"
          defaultChecked={perfil?.visivel_diretorio}
          className="h-4 w-4"
        />
        <label htmlFor="visivel_diretorio" className="text-sm font-semibold text-navy">
          Aparecer no diretório público
        </label>
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.mensagem && <p className="text-sm text-green-700">{state.mensagem}</p>}

      <button
        type="submit"
        disabled={pending}
        className="btn-primary disabled:opacity-50"
      >
        {pending ? "Salvando..." : "Salvar perfil"}
      </button>
    </form>
  );
}
