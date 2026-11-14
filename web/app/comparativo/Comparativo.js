"use client";

import { useState, useTransition } from "react";
import LogoPsiAgente from "@/components/LogoPsiAgente";
import { capturarLeadComparativo } from "@/lib/actions/comparativo";

const CATEGORIAS = [
  { chave: "aluguel", rotulo: "Aluguel do consultório" },
  { chave: "supervisao", rotulo: "Supervisão e formação" },
  { chave: "contas", rotulo: "Contas do consultório", dica: "Luz, internet, telefone" },
  { chave: "material", rotulo: "Material e software" },
  { chave: "outros", rotulo: "Outras despesas", dica: "Ex.: anuidade do CRP, marketing" },
];

const brl = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Aceita "8.000,00", "8000", "8000.50", "R$ 8.000". Vazio vira null.
function paraNumero(texto) {
  let t = String(texto ?? "").replace(/[R$\s]/g, "");
  if (t === "") return null;
  if (t.includes(",")) {
    t = t.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, "");
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

function CampoValor({ id, rotulo, dica, valor, onChange, obrigatorio }) {
  return (
    <div className="cmp-campo">
      <label htmlFor={id}>{rotulo}</label>
      <div className="cmp-valor">
        <span aria-hidden="true">R$</span>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0,00"
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          aria-required={obrigatorio || undefined}
          aria-describedby={dica ? `${id}-dica` : undefined}
        />
      </div>
      {dica && <small id={`${id}-dica`}>{dica}</small>}
    </div>
  );
}

function Barras({ pf, pj }) {
  const maior = Math.max(pf, pj, 1);
  const altura = (v) => `${(Math.max(v, 0) / maior) * 100}%`;
  return (
    <figure className="cmp-grafico">
      <figcaption>Líquido mensal no bolso</figcaption>
      <div
        className="cmp-barras"
        role="img"
        aria-label={`Líquido mensal: pessoa física ${brl(pf)}, pessoa jurídica ${brl(pj)}`}
      >
        <div className="cmp-barra">
          <span className="cmp-barra-valor">{brl(pf)}</span>
          <div className="cmp-barra-trilho">
            <div className="cmp-barra-fill pf" style={{ height: altura(pf) }} />
          </div>
          <span>Pessoa física</span>
        </div>
        <div className="cmp-barra">
          <span className="cmp-barra-valor">{brl(pj)}</span>
          <div className="cmp-barra-trilho">
            <div className="cmp-barra-fill pj" style={{ height: altura(pj) }} />
          </div>
          <span>Pessoa jurídica</span>
        </div>
      </div>
    </figure>
  );
}

function Resultado({ r, numeroGestor, onRefazer }) {
  const titulo =
    r.melhor === "empate"
      ? "Os dois cenários ficaram praticamente iguais"
      : r.melhor === "pj"
        ? "A pessoa jurídica compensa mais"
        : "Continuar como pessoa física compensa mais";

  const melhorSigla = r.melhor === "pj" ? "PJ" : "PF";
  const textoZap =
    r.melhor === "empate"
      ? `Olá! Fiz o comparativo PF x PJ do PsiAgente (líquido PF ${brl(r.pf.liquido)}, PJ ${brl(r.pj.liquido)}) e gostaria de conversar com um especialista.`
      : `Olá! Fiz o comparativo PF x PJ do PsiAgente e deu ${melhorSigla} como melhor opção (líquido PF ${brl(r.pf.liquido)}, PJ ${brl(r.pj.liquido)}). Gostaria de conversar com um especialista.`;

  return (
    <section aria-labelledby="cmp-res-titulo" className="cmp-passo">
      <h1 id="cmp-res-titulo" className="cmp-h1">
        {titulo}
      </h1>
      {r.melhor === "pj" && (
        <p className="cmp-economia">
          Você ficaria com <strong>{brl(r.economiaMensal)}</strong> a mais por mês,{" "}
          <strong>{brl(r.economiaAnual)}</strong> por ano.
        </p>
      )}
      {r.melhor === "pf" && (
        <p className="cmp-economia">
          Como pessoa física sobram <strong>{brl(r.economiaMensal)}</strong> a mais por mês.
        </p>
      )}

      <div className="cmp-cartoes">
        <article className={`cmp-cartao ${r.melhor === "pf" ? "vence" : ""}`}>
          <h2>Pessoa física</h2>
          <p className="cmp-sub">Carnê-Leão</p>
          <dl>
            <div>
              <dt>INSS</dt>
              <dd>{brl(r.pf.inss)}</dd>
            </div>
            <div>
              <dt>Imposto de renda</dt>
              <dd>{brl(r.pf.irpf)}</dd>
            </div>
            <div>
              <dt>Total de impostos</dt>
              <dd>{brl(r.pf.imposto)}</dd>
            </div>
            <div className="total">
              <dt>Líquido</dt>
              <dd>{brl(r.pf.liquido)}</dd>
            </div>
          </dl>
        </article>
        <article className={`cmp-cartao ${r.melhor === "pj" ? "vence" : ""}`}>
          <h2>Pessoa jurídica</h2>
          <p className="cmp-sub">Simples Nacional</p>
          <dl>
            <div>
              <dt>Simples Nacional</dt>
              <dd>{brl(r.pj.simples)}</dd>
            </div>
            <div>
              <dt>INSS do pró-labore</dt>
              <dd>{brl(r.pj.inssProLabore)}</dd>
            </div>
            <div>
              <dt>IRRF do pró-labore</dt>
              <dd>{brl(r.pj.irrfProLabore)}</dd>
            </div>
            <div>
              <dt>Total de impostos</dt>
              <dd>{brl(r.pj.imposto)}</dd>
            </div>
            <div>
              <dt>Contador</dt>
              <dd>{brl(r.pj.contador)}</dd>
            </div>
            <div className="total">
              <dt>Líquido</dt>
              <dd>{brl(r.pj.liquido)}</dd>
            </div>
          </dl>
        </article>
      </div>

      <Barras pf={r.pf.liquido} pj={r.pj.liquido} />

      {r.pj.liquido < 0 && (
        <p className="cmp-nota">Para faturamentos muito baixos a PJ raramente compensa.</p>
      )}
      {r.pj.avisoDividendos && (
        <p className="cmp-nota">
          Distribuições de lucro acima de R$ 50.000 por mês podem ter retenção de imposto.
          Consulte um contador.
        </p>
      )}
      <details className="cmp-premissas">
        <summary>Premissas do cálculo</summary>
        <ul>
          <li>INSS da PF: 20% sobre o faturamento, limitado ao teto do INSS</li>
          <li>Pró-labore da PJ: 28% do faturamento (Anexo III do Simples)</li>
          <li>Contador: {brl(r.pj.contador)}</li>
          <li>Distribuição de lucro considerada isenta</li>
          <li>ISS fixo municipal da PF não incluído</li>
          <li>Aposentadoria: o INSS da PF e o da PJ geram benefícios de valores diferentes</li>
        </ul>
      </details>
      <p className="cmp-aviso">Simulação estimada, não substitui orientação contábil.</p>

      <div className="cmp-acoes">
        <a
          className="cmp-btn primario"
          href={`https://wa.me/${numeroGestor}?text=${encodeURIComponent(textoZap)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Falar com o especialista (WhatsApp)
        </a>
        <a className="cmp-btn secundario" href="/cadastro?origem=comparativo">
          Cadastrar no PsiAgente
        </a>
      </div>
      <button type="button" className="cmp-voltar" onClick={onRefazer}>
        Refazer simulação
      </button>
    </section>
  );
}

export default function Comparativo({ numeroGestor }) {
  const [passo, setPasso] = useState(1);
  const [faturamento, setFaturamento] = useState("");
  const [despesas, setDespesas] = useState({
    aluguel: "",
    supervisao: "",
    contas: "",
    material: "",
    outros: "",
  });
  const [contador, setContador] = useState("300");
  const [contato, setContato] = useState({ nome: "", whatsapp: "", email: "", site: "" });
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState(null);
  const [pendente, iniciar] = useTransition();

  function valoresNumericos() {
    const fat = paraNumero(faturamento);
    if (fat === null || Number.isNaN(fat) || fat <= 0) {
      return { erro: "Informe um faturamento mensal maior que zero." };
    }
    const porCategoria = {};
    for (const { chave, rotulo } of CATEGORIAS) {
      const n = paraNumero(despesas[chave]);
      if (Number.isNaN(n) || (n !== null && n < 0)) {
        return { erro: `Informe um valor válido em "${rotulo}".` };
      }
      porCategoria[chave] = n ?? 0;
    }
    const cont = paraNumero(contador);
    if (Number.isNaN(cont) || (cont !== null && cont < 0)) {
      return { erro: "Informe um valor válido para o contador." };
    }
    return { faturamento: fat, despesasPorCategoria: porCategoria, contador: cont };
  }

  function avancar(e) {
    e.preventDefault();
    const v = valoresNumericos();
    if (v.erro) return setErro(v.erro);
    setErro("");
    setPasso(2);
  }

  function enviar(e) {
    e.preventDefault();
    if (pendente) return;
    const v = valoresNumericos();
    if (v.erro) {
      setErro(v.erro);
      setPasso(1);
      return;
    }
    setErro("");
    iniciar(async () => {
      try {
        const resp = await capturarLeadComparativo({ ...v, ...contato });
        if (!resp.ok) return setErro(resp.erro);
        if (!resp.resultado) return; // honeypot: não mostra nada
        setResultado(resp.resultado);
        setPasso(3);
      } catch {
        setErro("Não foi possível enviar agora. Tente novamente em instantes.");
      }
    });
  }

  const setDespesa = (chave) => (valor) => setDespesas((d) => ({ ...d, [chave]: valor }));
  const setC = (chave) => (e) => setContato((c) => ({ ...c, [chave]: e.target.value }));

  return (
    <div className="cmp-pagina">
      <header className="cmp-topo">
        <LogoPsiAgente className="cmp-logo" />
        <span className="cmp-marca">PsiAgente</span>
      </header>

      <main className="cmp-main">
        {passo === 1 && (
          <form className="cmp-passo" onSubmit={avancar} noValidate>
            <h1 className="cmp-h1">Carnê-Leão ou Simples Nacional: qual deixa mais no seu bolso?</h1>
            <p className="cmp-lead">
              Informe seus números mensais. Em dois passos você vê as duas opções lado a lado.
            </p>

            <CampoValor
              id="faturamento"
              rotulo="Faturamento mensal"
              valor={faturamento}
              onChange={setFaturamento}
              obrigatorio
            />

            <fieldset className="cmp-grupo">
              <legend>
                Despesas do consultório por mês <span>(opcional)</span>
              </legend>
              {CATEGORIAS.map(({ chave, rotulo, dica }) => (
                <CampoValor
                  key={chave}
                  id={`d-${chave}`}
                  rotulo={rotulo}
                  dica={dica}
                  valor={despesas[chave]}
                  onChange={setDespesa(chave)}
                />
              ))}
            </fieldset>

            <CampoValor
              id="contador"
              rotulo="Honorário do contador (só na PJ)"
              dica="Padrão de R$ 300. Altere se o seu for diferente."
              valor={contador}
              onChange={setContador}
            />

            <p className="cmp-erro" role="alert">
              {erro}
            </p>
            <button type="submit" className="cmp-btn primario">
              Ver comparativo
            </button>
          </form>
        )}

        {passo === 2 && (
          <form className="cmp-passo" onSubmit={enviar} noValidate>
            <h1 className="cmp-h1">Seu comparativo está pronto</h1>
            <p className="cmp-lead">Deixe seu contato para ver o resultado.</p>

            <div className="cmp-previa" aria-hidden="true">
              <div className="cmp-previa-cartao" />
              <div className="cmp-previa-cartao" />
            </div>

            <div className="cmp-campo">
              <label htmlFor="nome">Nome</label>
              <input
                id="nome"
                type="text"
                autoComplete="name"
                value={contato.nome}
                onChange={setC("nome")}
              />
            </div>
            <div className="cmp-campo">
              <label htmlFor="whatsapp">WhatsApp com DDD</label>
              <input
                id="whatsapp"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="(91) 90000-0000"
                value={contato.whatsapp}
                onChange={setC("whatsapp")}
              />
            </div>
            <div className="cmp-campo">
              <label htmlFor="email">E-mail</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={contato.email}
                onChange={setC("email")}
              />
            </div>
            <div className="cmp-isca" aria-hidden="true">
              <label htmlFor="site">Site</label>
              <input
                id="site"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={contato.site}
                onChange={setC("site")}
              />
            </div>

            <p className="cmp-erro" role="alert">
              {erro}
            </p>
            <button type="submit" className="cmp-btn primario" disabled={pendente}>
              {pendente ? "Calculando..." : "Ver resultado"}
            </button>
            <p className="cmp-lgpd">
              Usaremos seu contato apenas para falar com você sobre este comparativo.
            </p>
            <button
              type="button"
              className="cmp-voltar"
              disabled={pendente}
              onClick={() => {
                setErro("");
                setPasso(1);
              }}
            >
              Voltar e ajustar os valores
            </button>
          </form>
        )}

        {passo === 3 && resultado && <Resultado
            r={resultado}
            numeroGestor={numeroGestor}
            onRefazer={() => {
              setErro("");
              setResultado(null);
              setPasso(1);
            }}
          />}
      </main>
    </div>
  );
}
