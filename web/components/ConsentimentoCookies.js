"use client";

import { useEffect, useState } from "react";
import Script from "next/script";

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
const TEM_RASTREAMENTO = Boolean(GA_ID || ADS_ID);
const CHAVE_CONSENTIMENTO = "psifacil-consentimento-cookies";

export default function ConsentimentoCookies() {
  const [consentimento, setConsentimento] = useState(null);

  useEffect(() => {
    if (!TEM_RASTREAMENTO) return;
    setConsentimento(localStorage.getItem(CHAVE_CONSENTIMENTO));
  }, []);

  function responder(valor) {
    localStorage.setItem(CHAVE_CONSENTIMENTO, valor);
    setConsentimento(valor);
  }

  if (!TEM_RASTREAMENTO) return null;

  return (
    <>
      {consentimento === "aceito" && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID || ADS_ID}`}
            strategy="afterInteractive"
          />
          <Script id="gtag-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              ${GA_ID ? `gtag('config', '${GA_ID}');` : ""}
              ${ADS_ID ? `gtag('config', '${ADS_ID}');` : ""}
            `}
          </Script>
        </>
      )}

      {!consentimento && (
        <div className="fixed bottom-0 inset-x-0 z-50 bg-navy text-white px-4 py-3">
          <div className="max-w-3xl mx-auto flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              Usamos cookies para entender como você usa esta página e melhorar
              nossos anúncios.
            </p>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => responder("recusado")}
                className="btn-outline text-sm !bg-transparent !text-white !border-white/40"
              >
                Recusar
              </button>
              <button onClick={() => responder("aceito")} className="btn-primary text-sm">
                Aceitar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
