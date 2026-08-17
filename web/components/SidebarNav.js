"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { sair } from "@/lib/actions/auth";
import LogoPsiAgente from "@/components/LogoPsiAgente";
import { iniciais } from "@/lib/iniciais";
import {
  IconePainel,
  IconeAgenda,
  IconeRecorrencia,
  IconePaciente,
  IconeFinanceiro,
  IconeRecibo,
  IconeCarneLeao,
  IconeConsultorio,
  IconeDiretorio,
  IconeContaUsuario,
  IconeWhatsapp,
  IconeNotaFiscal,
  IconeDocumentos,
  IconeConfiguracoes,
  IconeChevron,
  IconeAdmin,
  IconeSair,
  IconeMenu,
  IconeFechar,
  IconeRecolher,
} from "@/components/icons/NavIcons";

const ITENS_NAV = [
  { href: "/", label: "Painel", Icone: IconePainel, exact: true },
  { href: "/agenda", label: "Agenda", Icone: IconeAgenda },
  { href: "/recorrencias", label: "Recorrências", Icone: IconeRecorrencia },
  { href: "/pacientes", label: "Pacientes", Icone: IconePaciente },
  { href: "/financeiro", label: "Financeiro", Icone: IconeFinanceiro },
  {
    grupo: "documentos",
    label: "Documentos",
    Icone: IconeDocumentos,
    itens: [
      { href: "/recibos", label: "Recibos", Icone: IconeRecibo },
      { href: "/notas-fiscais", label: "Notas Fiscais", Icone: IconeNotaFiscal },
      { href: "/carne-leao", label: "Carnê-Leão", Icone: IconeCarneLeao },
    ],
  },
  { href: "/consultorios", label: "Consultórios", Icone: IconeConsultorio },
  {
    grupo: "configuracoes",
    label: "Configurações",
    Icone: IconeConfiguracoes,
    itens: [
      { href: "/diretorio", label: "Diretório", Icone: IconeDiretorio },
      { href: "/configuracoes/conta", label: "Meus Dados", Icone: IconeContaUsuario },
      { href: "/configuracoes/whatsapp", label: "WhatsApp", Icone: IconeWhatsapp },
      { href: "/configuracoes/nfse", label: "NFS-e", Icone: IconeNotaFiscal },
    ],
  },
];

const ITEM_DIRETORIO = ITENS_NAV.find((item) => item.grupo === "configuracoes").itens.find(
  (item) => item.href === "/diretorio"
);

const CHAVE_RECOLHIDA = "psiagente-sidebar-recolhida";
const chaveGrupoAberto = (grupo) => `psiagente-sidebar-grupo-${grupo}`;

const ROTULOS_PAPEL = {
  admin: "Administrador",
  psicologo: "Psicólogo(a)",
};

export default function SidebarNav({ ehAdmin, nome, papel, plano }) {
  const pathname = usePathname();
  const [menuAberto, setMenuAberto] = useState(false);
  const [recolhida, setRecolhida] = useState(false);
  const [gruposAbertos, setGruposAbertos] = useState({});

  useEffect(() => {
    setMenuAberto(false);
  }, [pathname]);

  useEffect(() => {
    if (localStorage.getItem(CHAVE_RECOLHIDA) === "true") setRecolhida(true);
  }, []);

  useEffect(() => {
    const valoresIniciais = {};
    for (const item of ITENS_NAV) {
      if (item.itens) valoresIniciais[item.grupo] = localStorage.getItem(chaveGrupoAberto(item.grupo)) === "true";
    }
    setGruposAbertos(valoresIniciais);
  }, []);

  function estaAtivo(href, exact) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  useEffect(() => {
    setGruposAbertos((atual) => {
      let mudou = false;
      const novo = { ...atual };
      for (const item of ITENS_NAV) {
        if (item.itens && !novo[item.grupo] && item.itens.some((i) => estaAtivo(i.href, i.exact))) {
          novo[item.grupo] = true;
          mudou = true;
        }
      }
      return mudou ? novo : atual;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  function alternarRecolhida() {
    setRecolhida((atual) => {
      const novo = !atual;
      localStorage.setItem(CHAVE_RECOLHIDA, String(novo));
      return novo;
    });
  }

  function alternarGrupo(grupo) {
    setGruposAbertos((atual) => {
      const novoValor = !atual[grupo];
      localStorage.setItem(chaveGrupoAberto(grupo), String(novoValor));
      return { ...atual, [grupo]: novoValor };
    });
  }

  const itens =
    plano === "marketing"
      ? [ITEM_DIRETORIO]
      : ehAdmin
        ? [...ITENS_NAV, { href: "/admin/profissionais", label: "Administração", Icone: IconeAdmin }]
        : ITENS_NAV;

  function ItemNav({ item, compacta, onNavegar }) {
    const { href, label, Icone, exact } = item;
    const ativo = estaAtivo(href, exact);
    return (
      <Link
        href={href}
        onClick={onNavegar}
        title={compacta ? label : undefined}
        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-navy transition-colors hover:bg-background ${
          ativo ? "bg-background" : ""
        } ${compacta ? "justify-center" : ""}`}
      >
        <Icone className={ativo ? "shrink-0 text-primary" : "shrink-0 text-muted"} />
        {!compacta && label}
      </Link>
    );
  }

  function GrupoNav({ grupo, compacta, onNavegar }) {
    const { grupo: chave, label, Icone, itens: filhos } = grupo;
    const algumAtivo = filhos.some((i) => estaAtivo(i.href, i.exact));

    if (compacta) {
      return (
        <div className="group/flyout relative">
          <button
            type="button"
            title={label}
            className={`flex w-full items-center justify-center rounded-xl px-3 py-2.5 text-sm font-semibold text-navy transition-colors hover:bg-background ${
              algumAtivo ? "bg-background" : ""
            }`}
          >
            <Icone className={algumAtivo ? "shrink-0 text-primary" : "shrink-0 text-muted"} />
          </button>
          <div className="absolute left-full top-0 z-20 ml-2 w-48 rounded-xl border border-border bg-white p-2 opacity-0 shadow-lg pointer-events-none transition-opacity group-hover/flyout:opacity-100 group-hover/flyout:pointer-events-auto group-focus-within/flyout:opacity-100 group-focus-within/flyout:pointer-events-auto">
            <p className="px-2 pb-1 text-xs font-semibold text-muted">{label}</p>
            {filhos.map((filho) => (
              <ItemNav key={filho.href} item={filho} compacta={false} onNavegar={onNavegar} />
            ))}
          </div>
        </div>
      );
    }

    const aberto = Boolean(gruposAbertos[chave]);
    return (
      <div>
        <button
          type="button"
          onClick={() => alternarGrupo(chave)}
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-navy transition-colors hover:bg-background ${
            algumAtivo ? "bg-background" : ""
          }`}
        >
          <Icone className={algumAtivo ? "shrink-0 text-primary" : "shrink-0 text-muted"} />
          <span className="flex-1 text-left">{label}</span>
          <IconeChevron
            className={`h-3.5 w-3.5 shrink-0 text-muted transition-transform ${aberto ? "rotate-90" : ""}`}
          />
        </button>
        {aberto && (
          <div className="mt-1 space-y-1 pl-4">
            {filhos.map((filho) => (
              <ItemNav key={filho.href} item={filho} compacta={false} onNavegar={onNavegar} />
            ))}
          </div>
        )}
      </div>
    );
  }

  function ListaNav({ compacta, onNavegar }) {
    return (
      <nav className={`flex-1 space-y-1 px-3 pb-4 ${compacta ? "overflow-visible" : "overflow-y-auto"}`}>
        {itens.map((item) =>
          item.itens ? (
            <GrupoNav key={item.grupo} grupo={item} compacta={compacta} onNavegar={onNavegar} />
          ) : (
            <ItemNav key={item.href} item={item} compacta={compacta} onNavegar={onNavegar} />
          )
        )}
      </nav>
    );
  }

  function CartaoUsuario({ compacto }) {
    return (
      <div
        className={`flex items-center gap-2.5 px-3 py-2 ${compacto ? "justify-center px-0" : ""}`}
        title={compacto ? nome : undefined}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
          {iniciais(nome)}
        </span>
        {!compacto && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-navy">{nome}</p>
            <p className="truncate text-xs text-muted">{ROTULOS_PAPEL[papel] ?? papel}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {/* Barra compacta mobile */}
      <div className="flex items-center justify-between border-b border-border bg-white px-4 py-3 lg:hidden">
        <Link href="/" className="flex items-center gap-2">
          <LogoPsiAgente className="h-7 w-auto" />
          <span className="font-display text-base font-bold text-navy">PsiAgente</span>
        </Link>
        <button
          type="button"
          onClick={() => setMenuAberto(true)}
          aria-label="Abrir menu"
          className="rounded-lg p-2 text-navy hover:bg-background"
        >
          <IconeMenu />
        </button>
      </div>

      {/* Overlay + gaveta mobile */}
      {menuAberto && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setMenuAberto(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[80vw] flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between px-5 py-4">
              <Link
                href="/"
                className="flex items-center gap-2.5"
                onClick={() => setMenuAberto(false)}
              >
                <LogoPsiAgente className="h-8 w-auto" />
                <span className="font-display text-lg font-bold text-navy">PsiAgente</span>
              </Link>
              <button
                type="button"
                onClick={() => setMenuAberto(false)}
                aria-label="Fechar menu"
                className="rounded-lg p-1.5 text-muted hover:bg-background"
              >
                <IconeFechar />
              </button>
            </div>

            <ListaNav compacta={false} onNavegar={() => setMenuAberto(false)} />

            <div className="space-y-1 border-t border-border px-3 py-4">
              <CartaoUsuario compacto={false} />
              <form action={sair}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted transition-colors hover:bg-background"
                >
                  <IconeSair className="shrink-0" />
                  Sair
                </button>
              </form>
            </div>
          </aside>
        </div>
      )}

      {/* Sidebar fixa desktop */}
      <aside
        className={`hidden shrink-0 border-r border-border bg-white transition-[width] duration-200 lg:flex lg:flex-col ${
          recolhida ? "lg:w-[76px]" : "lg:w-60"
        }`}
      >
        <div className={`flex items-center gap-2.5 px-5 py-6 ${recolhida ? "justify-center px-0" : ""}`}>
          <Link href="/" className="flex items-center gap-2.5">
            <LogoPsiAgente className="h-9 w-auto" />
            {!recolhida && <span className="font-display text-xl font-bold text-navy">PsiAgente</span>}
          </Link>
        </div>

        <ListaNav compacta={recolhida} />

        <div className="space-y-1 border-t border-border px-3 py-3">
          <CartaoUsuario compacto={recolhida} />
          <form action={sair}>
            <button
              type="submit"
              title={recolhida ? "Sair" : undefined}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted transition-colors hover:bg-background ${
                recolhida ? "justify-center" : ""
              }`}
            >
              <IconeSair className="shrink-0" />
              {!recolhida && "Sair"}
            </button>
          </form>

          <button
            type="button"
            onClick={alternarRecolhida}
            aria-label={recolhida ? "Expandir menu" : "Recolher menu"}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-muted transition-colors hover:bg-background ${
              recolhida ? "justify-center" : ""
            }`}
          >
            <IconeRecolher className={recolhida ? "shrink-0 rotate-180" : "shrink-0"} />
            {!recolhida && "Recolher menu"}
          </button>
        </div>
      </aside>
    </>
  );
}
