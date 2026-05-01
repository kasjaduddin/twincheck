// UC-01 Claim Summary panel — first thing adjuster sees in AR.
// FR-MR-02.4: Site Address, Site Contact, Equipment Type, Insured Value,
//             Coverage Period, Claimed Amount, CAD Reference.

interface Props {
  claimId: string;
  policyHolder: string;
  equipmentType: string;
  siteAddress: string;
  siteContact: string;
  insuredValue: number;
  claimedAmount: number;
  coverageStart: string;
  coverageEnd: string;
  onContinue: () => void;
}

function eur(n: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

function fmt(iso: string) {
  return iso ? iso.slice(0, 10) : "—";
}

export function ClaimSummaryPanel(props: Props) {
  const { claimId, policyHolder, equipmentType, siteAddress, siteContact,
    insuredValue, claimedAmount, coverageStart, coverageEnd, onContinue } = props;

  return (
    <div style={{
      position: "fixed",
      top: "50%", left: "50%",
      transform: "translate(-50%, -50%)",
      width: 420,
      background: "rgba(8,8,14,0.85)",
      backdropFilter: "blur(20px)",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 20,
      padding: "26px 30px",
      fontFamily: "-apple-system, 'SF Pro Text', sans-serif",
      color: "#fff",
      zIndex: 40,
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
          textTransform: "uppercase", background: "#16a34a",
          padding: "3px 8px", borderRadius: 6, color: "#fff",
        }}>
          On-Site
        </span>
        <span style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.35)" }}>
          {claimId.slice(0, 8).toUpperCase()}
        </span>
      </div>

      <h2 style={{ fontSize: 20, fontWeight: 700, margin: "8px 0 20px", lineHeight: 1.2 }}>
        {policyHolder}
      </h2>

      {/* Data grid */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 26 }}>
        <Row label="Equipment"  value={equipmentType} />
        <Row label="Site"       value={siteAddress} />
        <Row label="Contact"    value={siteContact} />
        <Row label="Coverage"   value={`${fmt(coverageStart)} — ${fmt(coverageEnd)}`} />
        <Row label="Insured"    value={eur(insuredValue)}   highlight />
        <Row label="Claimed"    value={eur(claimedAmount)}  highlight />
      </div>

      <button
        onClick={onContinue}
        style={{
          width: "100%", padding: "14px 20px",
          background: "#2563eb", color: "#fff",
          border: "none", borderRadius: 12,
          fontSize: 15, fontWeight: 600,
          cursor: "pointer", display: "flex",
          justifyContent: "center", alignItems: "center", gap: 8,
          fontFamily: "inherit",
        }}
      >
        Start Interview
        <span style={{ fontSize: 18 }}>→</span>
      </button>

      <style>{`.mr-panel-btn:hover { filter: brightness(1.1); }`}</style>
    </div>
  );
}

function Row({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", flexShrink: 0, minWidth: 80 }}>
        {label}
      </span>
      <span style={{
        fontSize: 13, color: "#fff", textAlign: "right", lineHeight: 1.4,
        fontWeight: highlight ? 600 : 400,
      }}>
        {value}
      </span>
    </div>
  );
}
