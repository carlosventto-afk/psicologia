const base = {
  width: 18,
  height: 18,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export function IconePainel(props) {
  return (
    <svg {...base} {...props}>
      <path d="M3 10.5 10 4l7 6.5" />
      <path d="M5 9v7h10V9" />
    </svg>
  );
}

export function IconeAgenda(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="4.5" width="13" height="12" rx="2" />
      <path d="M3.5 8.5h13" />
      <path d="M7 3v3M13 3v3" />
    </svg>
  );
}

export function IconeRecorrencia(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 10a6 6 0 0 1 10.2-4.3L16 7.3" />
      <path d="M16 4v3.3h-3.3" />
      <path d="M16 10a6 6 0 0 1-10.2 4.3L4 12.7" />
      <path d="M4 16v-3.3h3.3" />
    </svg>
  );
}

export function IconePaciente(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="10" cy="6.5" r="3" />
      <path d="M4 17c0-3.3 2.7-6 6-6s6 2.7 6 6" />
    </svg>
  );
}

export function IconeFinanceiro(props) {
  return (
    <svg {...base} {...props}>
      <path d="M10 3v14" />
      <path d="M13.5 6.2c0-1.2-1.6-2.2-3.5-2.2s-3.5 1-3.5 2.4 1.6 1.9 3.5 2.1 3.5.8 3.5 2.2-1.5 2.2-3.5 2.2-3.5-.9-3.5-2.1" />
    </svg>
  );
}

export function IconeRecibo(props) {
  return (
    <svg {...base} {...props}>
      <path d="M5.5 3h9v14l-2-1.3-2 1.3-2-1.3-2 1.3z" />
      <path d="M8 7h4M8 10h4" />
    </svg>
  );
}

export function IconeConsultorio(props) {
  return (
    <svg {...base} {...props}>
      <path d="M10 17.5s5.5-4.8 5.5-9a5.5 5.5 0 1 0-11 0c0 4.2 5.5 9 5.5 9Z" />
      <circle cx="10" cy="8.3" r="2" />
    </svg>
  );
}

export function IconeDiretorio(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="9" cy="9" r="5.5" />
      <path d="m17 17-3.5-3.5" />
    </svg>
  );
}

export function IconeWhatsapp(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 17l1.1-3.3A6.5 6.5 0 1 1 8 16.4Z" />
      <path d="M7.5 8.5c0 3 2 5 5 5" />
    </svg>
  );
}

export function IconeAdmin(props) {
  return (
    <svg {...base} {...props}>
      <rect x="5" y="9" width="10" height="8" rx="1.5" />
      <path d="M7.5 9V6.5a2.5 2.5 0 0 1 5 0V9" />
    </svg>
  );
}

export function IconeSair(props) {
  return (
    <svg {...base} {...props}>
      <path d="M8 17H4.5A1.5 1.5 0 0 1 3 15.5v-11A1.5 1.5 0 0 1 4.5 3H8" />
      <path d="M13 13.5 17 10l-4-3.5" />
      <path d="M17 10H8" />
    </svg>
  );
}

export function IconeMenu(props) {
  return (
    <svg {...base} {...props}>
      <path d="M3.5 6h13M3.5 10h13M3.5 14h13" />
    </svg>
  );
}

export function IconeFechar(props) {
  return (
    <svg {...base} {...props}>
      <path d="M5 5l10 10M15 5 5 15" />
    </svg>
  );
}

export function IconeRecolher(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="3.5" width="14" height="13" rx="2" />
      <path d="M8 3.5v13" />
      <path d="m13.5 8-2 2 2 2" />
    </svg>
  );
}
