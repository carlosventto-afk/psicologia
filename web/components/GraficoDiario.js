function formatarDataCurta(iso) {
  const [, mes, dia] = iso.split("-");
  return `${dia}/${mes}`;
}

// Sem lib de gráfico: barras verticais em CSS puro, com título nativo do
// navegador fazendo as vezes de tooltip. Labels de data espaçados pra não
// empilhar quando há muitos dias no período.
export default function GraficoDiario({ porDia }) {
  const max = Math.max(1, ...porDia.map((d) => d.total));
  const espacamentoLabel = porDia.length > 45 ? 7 : porDia.length > 20 ? 3 : 1;

  return (
    <div>
      <div className="flex h-32 items-end gap-1">
        {porDia.map((d) => {
          const altura = d.total === 0 ? 0 : Math.max(4, Math.round((d.total / max) * 100));
          return (
            <div
              key={d.data}
              className="flex-1 rounded-t bg-navy"
              style={{ height: `${altura}%` }}
              title={`${formatarDataCurta(d.data)}: ${d.total} visita(s)`}
            />
          );
        })}
      </div>
      <div className="mt-1 flex gap-1 text-[10px] text-muted">
        {porDia.map((d, i) => (
          <div key={d.data} className="flex-1 text-center">
            {i % espacamentoLabel === 0 ? formatarDataCurta(d.data) : ""}
          </div>
        ))}
      </div>
    </div>
  );
}
