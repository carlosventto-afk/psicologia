export default function BarraEstatistica({ label, total, max }) {
  const largura = total > 0 && max > 0 ? Math.max(3, Math.round((total / max) * 100)) : 0;

  return (
    <div
      className="flex items-center gap-3 text-sm"
      title={`${label}: ${total.toLocaleString("pt-BR")}`}
    >
      <span className="w-44 shrink-0 truncate text-foreground">{label}</span>
      <div className="h-2 flex-1 rounded-full bg-border">
        <div className="h-2 rounded-full bg-navy" style={{ width: `${largura}%` }} />
      </div>
      <span className="w-12 shrink-0 text-right font-semibold text-navy">
        {total.toLocaleString("pt-BR")}
      </span>
    </div>
  );
}
