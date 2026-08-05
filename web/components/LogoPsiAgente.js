export default function LogoPsiAgente({ className = "h-8 w-auto", stroke = "#17514E" }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path d="M16 28V15.2" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M16 15.2V4.6" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" />
      <path
        d="M16 15.2C16 15.2 7.8 14.4 7.8 5.4"
        stroke={stroke}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M16 15.2C16 15.2 21.5 14.5 21.9 9"
        stroke={stroke}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="22.4" cy="7" r="1.9" fill="#6FCBB6" />
    </svg>
  );
}
