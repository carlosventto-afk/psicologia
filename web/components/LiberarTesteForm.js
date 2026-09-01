import { liberarTeste, encerrarTeste } from "@/lib/actions/profissionais";

const PLANOS_TESTE = [
  { value: "gestao", label: "Psi Gestão" },
  { value: "gestao_marketing", label: "Psi Gestão + Marketing" },
  { value: "marketing", label: "Psi Marketing" },
];

export default function LiberarTesteForm({ id, planoPago, planoTesteExpiraEm }) {
  const testeAtivo = planoTesteExpiraEm && new Date(planoTesteExpiraEm) > new Date();

  if (testeAtivo) {
    const dataFormatada = new Date(planoTesteExpiraEm).toLocaleDateString("pt-BR");
    return (
      <form action={encerrarTeste.bind(null, id, planoPago)} className="flex items-center gap-2">
        <span className="text-sm text-blue-700">Teste até {dataFormatada}</span>
        <button type="submit" className="btn-outline text-sm">
          Encerrar teste
        </button>
      </form>
    );
  }

  return (
    <form action={liberarTeste.bind(null, id)} className="flex flex-wrap items-center gap-2">
      <select name="plano" defaultValue="gestao_marketing" className="field mt-0 w-auto text-sm">
        {PLANOS_TESTE.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>
      <input type="date" name="data" required className="field mt-0 w-auto text-sm" />
      <button type="submit" className="btn-outline text-sm">
        Liberar teste
      </button>
    </form>
  );
}
